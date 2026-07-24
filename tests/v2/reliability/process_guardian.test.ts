import { ProcessGuardian } from '../../../src/v2/infrastructure/resilience/process_guardian';

/**
 * `process` is a true process-wide singleton, and --runInBand runs every test file in one shared
 * Node process. Every guardian installed here MUST be uninstalled in afterEach — an un-uninstalled
 * guardian's real 'SIGTERM'/'uncaughtException' listeners would still fire (and pollute) later
 * tests' synthetic process.emit() calls in this same process.
 */
describe('SE-OS v2.0 Milestone 29 Workstream A — ProcessGuardian', () => {
  let guardian: ProcessGuardian | undefined;

  afterEach(() => {
    guardian?.uninstall();
    guardian = undefined;
  });

  it('should call onShutdownSignal and exit(0) on a real SIGTERM', async () => {
    let shutdownSignal: NodeJS.Signals | undefined;
    let exitCode: number | undefined;
    let resolveShutdown: () => void;
    const shutdownCalled = new Promise<void>((resolve) => { resolveShutdown = resolve; });

    guardian = new ProcessGuardian({
      onShutdownSignal: async (signal) => {
        shutdownSignal = signal;
        resolveShutdown();
      },
      onFatalError: async () => {},
      exit: (code) => { exitCode = code; },
    });
    guardian.install();

    process.emit('SIGTERM', 'SIGTERM');
    await shutdownCalled;

    expect(shutdownSignal).toBe('SIGTERM');
    expect(exitCode).toBe(0);
  });

  it('should call onShutdownSignal and exit(0) on a real SIGINT', async () => {
    let shutdownSignal: NodeJS.Signals | undefined;
    let exitCode: number | undefined;
    let resolveShutdown: () => void;
    const shutdownCalled = new Promise<void>((resolve) => { resolveShutdown = resolve; });

    guardian = new ProcessGuardian({
      onShutdownSignal: async (signal) => {
        shutdownSignal = signal;
        resolveShutdown();
      },
      onFatalError: async () => {},
      exit: (code) => { exitCode = code; },
    });
    guardian.install();

    process.emit('SIGINT', 'SIGINT');
    await shutdownCalled;

    expect(shutdownSignal).toBe('SIGINT');
    expect(exitCode).toBe(0);
  });

  it('should not double-invoke onShutdownSignal on a second signal while already shutting down', async () => {
    let callCount = 0;
    let exitCode: number | undefined;
    let releaseFirstShutdown: () => void;
    let resolveFirstShutdownStarted: () => void;
    const firstShutdownStarted = new Promise<void>((resolve) => { resolveFirstShutdownStarted = resolve; });

    guardian = new ProcessGuardian({
      onShutdownSignal: async () => {
        callCount++;
        resolveFirstShutdownStarted();
        await new Promise<void>((r) => { releaseFirstShutdown = r; });
      },
      onFatalError: async () => {},
      exit: (code) => { exitCode = code; },
    });
    guardian.install();

    process.emit('SIGTERM', 'SIGTERM');
    await firstShutdownStarted;
    process.emit('SIGTERM', 'SIGTERM'); // second signal while the first is still draining

    expect(callCount).toBe(1);
    releaseFirstShutdown!();
    await new Promise((resolve) => setImmediate(resolve));
    expect(exitCode).toBe(0);
  });

  it('should call onFatalError and exit(1) on a real uncaughtException, never swallowing it silently', async () => {
    let capturedError: unknown;
    let capturedOrigin: string | undefined;
    let exitCode: number | undefined;
    let resolveFatal: () => void;
    const fatalCalled = new Promise<void>((resolve) => { resolveFatal = resolve; });

    guardian = new ProcessGuardian({
      onShutdownSignal: async () => {},
      onFatalError: async (error, origin) => {
        capturedError = error;
        capturedOrigin = origin;
        resolveFatal();
      },
      exit: (code) => { exitCode = code; },
    });
    guardian.install();

    const testError = new Error('synthetic uncaught exception for test');
    process.emit('uncaughtException', testError);
    await fatalCalled;

    expect(capturedError).toBe(testError);
    expect(capturedOrigin).toBe('uncaughtException');
    expect(exitCode).toBe(1);
  });

  it('should call onFatalError and exit(1) on a real unhandledRejection', async () => {
    let capturedOrigin: string | undefined;
    let exitCode: number | undefined;
    let resolveFatal: () => void;
    const fatalCalled = new Promise<void>((resolve) => { resolveFatal = resolve; });

    guardian = new ProcessGuardian({
      onShutdownSignal: async () => {},
      onFatalError: async (_error, origin) => {
        capturedOrigin = origin;
        resolveFatal();
      },
      exit: (code) => { exitCode = code; },
    });
    guardian.install();

    process.emit('unhandledRejection', new Error('synthetic rejection for test'), Promise.resolve());
    await fatalCalled;

    expect(capturedOrigin).toBe('unhandledRejection');
    expect(exitCode).toBe(1);
  });

  it('should exit(1) even if onFatalError itself throws, never hanging the process', async () => {
    let exitCode: number | undefined;
    let resolveExit: () => void;
    const exited = new Promise<void>((resolve) => { resolveExit = resolve; });

    guardian = new ProcessGuardian({
      onShutdownSignal: async () => {},
      onFatalError: async () => {
        throw new Error('onFatalError handler itself is broken');
      },
      exit: (code) => { exitCode = code; resolveExit(); },
    });
    guardian.install();

    process.emit('uncaughtException', new Error('original error'));
    await exited;

    expect(exitCode).toBe(1);
  });

  it('should exit(1) if graceful shutdown itself throws', async () => {
    let exitCode: number | undefined;
    let resolveExit: () => void;
    const exited = new Promise<void>((resolve) => { resolveExit = resolve; });

    guardian = new ProcessGuardian({
      onShutdownSignal: async () => {
        throw new Error('shutdown failed');
      },
      onFatalError: async () => {},
      exit: (code) => { exitCode = code; resolveExit(); },
    });
    guardian.install();

    process.emit('SIGTERM', 'SIGTERM');
    await exited;

    expect(exitCode).toBe(1);
  });

  it('should not install duplicate listeners when install() is called twice', async () => {
    let callCount = 0;
    guardian = new ProcessGuardian({
      onShutdownSignal: async () => { callCount++; },
      onFatalError: async () => {},
      exit: () => {},
    });
    guardian.install();
    guardian.install();

    process.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));

    expect(callCount).toBe(1);
  });

  it('uninstall() should remove all listeners so a later signal has no effect', async () => {
    let callCount = 0;
    guardian = new ProcessGuardian({
      onShutdownSignal: async () => { callCount++; },
      onFatalError: async () => {},
      exit: () => {},
    });
    guardian.install();
    guardian.uninstall();

    process.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));

    expect(callCount).toBe(0);
  });
});
