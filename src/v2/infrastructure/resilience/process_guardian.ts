export type ProcessGuardianLogLevel = 'INFO' | 'WARN' | 'ERROR';
export type ProcessGuardianLogger = (level: ProcessGuardianLogLevel, message: string, meta?: unknown) => void;

export interface ProcessGuardianOptions {
  /** Called on a real SIGTERM/SIGINT. Must resolve once it is safe to exit. */
  onShutdownSignal: (signal: NodeJS.Signals) => Promise<void>;
  /** Called on an uncaught exception or unhandled rejection — see ADR-0008's containment policy:
   * log with full context, attempt a clean shutdown, then exit. Never swallow-and-continue for an
   * error of unknown origin; only specific, well-understood failures (a single plugin's execute()
   * throwing, already handled at the call site) get contained-and-continue treatment. */
  onFatalError: (error: unknown, origin: 'uncaughtException' | 'unhandledRejection') => Promise<void>;
  logger?: ProcessGuardianLogger;
  /** Injectable so tests can assert on the exit code without actually killing the test process. */
  exit?: (code: number) => void;
  process?: NodeJS.Process;
}

const defaultLogger: ProcessGuardianLogger = (level, message, meta) => {
  const line = `[ProcessGuardian] ${message}`;
  if (level === 'ERROR') console.error(line, meta ?? '');
  else if (level === 'WARN') console.warn(line, meta ?? '');
  else console.log(line);
};

/**
 * The process's last line of defense (see ADR-0008). Before this existed, SE-OS had zero
 * process.on('SIGTERM'|'SIGINT'|'uncaughtException'|'unhandledRejection') handlers anywhere —
 * Ctrl+C or a container SIGTERM killed the process with no chance for Kernel.shutdown() to run,
 * and a single uncaught error anywhere (a plugin, a worker callback, a TUI render) crashed the
 * entire company silently, with no log trace.
 *
 * Signals and fatal errors are handled differently on purpose: a signal is an *expected* request
 * to stop (drain and exit 0), while a fatal error is an *unexpected* failure of unknown origin
 * (log with full context, attempt the same clean drain, but exit non-zero — continuing to run
 * with unknown corruption is worse than a clean, visible crash-and-restart).
 */
export class ProcessGuardian {
  private installed = false;
  private shuttingDown = false;
  private readonly logger: ProcessGuardianLogger;
  private readonly exit: (code: number) => void;
  private readonly proc: NodeJS.Process;

  private readonly handleSignal = (signal: NodeJS.Signals): void => {
    void this.runShutdown(signal);
  };
  private readonly handleUncaughtException = (error: Error): void => {
    void this.runFatal(error, 'uncaughtException');
  };
  private readonly handleUnhandledRejection = (reason: unknown): void => {
    void this.runFatal(reason, 'unhandledRejection');
  };

  constructor(private readonly options: ProcessGuardianOptions) {
    this.logger = options.logger || defaultLogger;
    this.exit = options.exit || ((code: number) => process.exit(code));
    this.proc = options.process || process;
  }

  install(): void {
    if (this.installed) return;
    this.installed = true;
    this.proc.on('SIGTERM', this.handleSignal);
    this.proc.on('SIGINT', this.handleSignal);
    this.proc.on('uncaughtException', this.handleUncaughtException);
    this.proc.on('unhandledRejection', this.handleUnhandledRejection);
  }

  /** For tests only — removes all handlers this instance installed, so repeated test runs in one
   * process don't accumulate listeners across instances. */
  uninstall(): void {
    if (!this.installed) return;
    this.installed = false;
    this.proc.off('SIGTERM', this.handleSignal);
    this.proc.off('SIGINT', this.handleSignal);
    this.proc.off('uncaughtException', this.handleUncaughtException);
    this.proc.off('unhandledRejection', this.handleUnhandledRejection);
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  private async runShutdown(signal: NodeJS.Signals): Promise<void> {
    if (this.shuttingDown) {
      this.logger('WARN', `Received ${signal} again while already shutting down — ignoring.`);
      return;
    }
    this.shuttingDown = true;
    this.logger('INFO', `Received ${signal}, shutting down gracefully...`);
    try {
      await this.options.onShutdownSignal(signal);
      this.logger('INFO', 'Graceful shutdown complete.');
      this.exit(0);
    } catch (err) {
      this.logger('ERROR', 'Graceful shutdown failed.', err);
      this.exit(1);
    }
  }

  private async runFatal(error: unknown, origin: 'uncaughtException' | 'unhandledRejection'): Promise<void> {
    this.logger('ERROR', `Fatal error (${origin}) — containing and attempting clean shutdown.`, error);
    if (this.shuttingDown) {
      // A fatal error during an already-in-progress shutdown must not hang the process waiting
      // on a second graceful drain that may never complete — exit immediately.
      this.exit(1);
      return;
    }
    this.shuttingDown = true;
    try {
      await this.options.onFatalError(error, origin);
    } catch (err) {
      this.logger('ERROR', 'onFatalError handler itself threw — exiting anyway.', err);
    }
    this.exit(1);
  }
}
