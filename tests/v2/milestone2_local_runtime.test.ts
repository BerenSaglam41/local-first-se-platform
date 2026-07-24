import { Kernel } from '../../src/v2/kernel/kernel';
import { LocalProcessSupervisor } from '../../src/v2/application/runtime/local_process_supervisor';
import { SqliteEventStore } from '../../src/v2/infrastructure/storage/sqlite_event_store';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import * as fs from 'fs';
import * as path from 'path';

describe('SE-OS v2.0 Milestone 2 — Local Process Runtime & PTY Suite', () => {
  const testDbPath = './se_company_m2_test.db';
  let kernel: Kernel;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    kernel = new Kernel();
  });

  afterEach(async () => {
    if (kernel.isReady()) {
      await kernel.shutdown();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should spawn real local child processes with valid PIDs', async () => {
    const eventStore = new SqliteEventStore(testDbPath);
    await eventStore.connect();

    const supervisor = new LocalProcessSupervisor(eventStore);
    supervisor.startSupervision();

    const dummyScript = path.join(__dirname, '../../src/v2/application/runtime/dummy_worker.js');

    const worker = supervisor.spawnWorker({
      id: 'emp-test-1',
      name: 'TestWorker',
      role: 'Tester',
      department: 'QA',
      executable: process.execPath,
      args: [dummyScript],
    });

    expect(worker.metrics.pid).toBeGreaterThan(0);
    expect(worker.state).toBe('IDLE');

    const pty = supervisor.getPtyEngine('emp-test-1');
    expect(pty).toBeDefined();
    expect(pty?.isAttachedMode()).toBe(true);

    supervisor.stopWorker('emp-test-1');
    supervisor.stopSupervision();
    await eventStore.close();
  });

  it('should support stdin writing and stdout capturing via PtyEngine', (done) => {
    const supervisor = new LocalProcessSupervisor();
    const dummyScript = path.join(__dirname, '../../src/v2/application/runtime/dummy_worker.js');

    supervisor.spawnWorker({
      id: 'emp-test-2',
      name: 'TestWorker2',
      role: 'Tester',
      department: 'QA',
      executable: process.execPath,
      args: [dummyScript],
    });

    const pty = supervisor.getPtyEngine('emp-test-2');
    expect(pty).toBeDefined();

    let output = '';
    pty?.on('data', (text) => {
      output += text;
      if (output.includes('[Dummy Worker ECHO] hello-world')) {
        supervisor.stopWorker('emp-test-2');
        done();
      }
    });

    // Send stdin to dummy worker process
    setTimeout(() => {
      pty?.write('hello-world\n');
    }, 100);
  });

  it('should restart worker processes and increment restartCount', async () => {
    const supervisor = new LocalProcessSupervisor();
    const dummyScript = path.join(__dirname, '../../src/v2/application/runtime/dummy_worker.js');

    const worker = supervisor.spawnWorker({
      id: 'emp-test-3',
      name: 'TestWorker3',
      role: 'Tester',
      department: 'QA',
      executable: process.execPath,
      args: [dummyScript],
    });

    const oldPid = worker.metrics.pid;

    const restarted = supervisor.restartWorker('emp-test-3');
    expect(restarted).toBeDefined();
    expect(restarted?.metrics.restartCount).toBe(1);
    expect(restarted?.metrics.pid).toBeGreaterThan(0);
    expect(restarted?.metrics.pid).not.toBe(oldPid);

    supervisor.stopWorker('emp-test-3');
  });

  it('should kill worker processes with SIGKILL', async () => {
    const supervisor = new LocalProcessSupervisor();
    const dummyScript = path.join(__dirname, '../../src/v2/application/runtime/dummy_worker.js');

    supervisor.spawnWorker({
      id: 'emp-test-4',
      name: 'TestWorker4',
      role: 'Tester',
      department: 'QA',
      executable: process.execPath,
      args: [dummyScript],
    });

    const killed = supervisor.killWorker('emp-test-4');
    expect(killed).toBe(true);
    expect(supervisor.getRegistry().get('emp-test-4')).toBeUndefined();
  });

  it('should collect detailed telemetry including worker PIDs, CPU, and RAM', async () => {
    await kernel.boot('./non_existent_config.json');
    const snapshot = kernel.getTelemetry().getSnapshot(
      kernel.getSupervisor().getRegistry().list(),
      0
    );

    expect(snapshot.workers.length).toBe(3);
    expect(snapshot.workers[0].pid).toBeGreaterThan(0);
    expect(snapshot.memoryRssMb).toBeGreaterThan(0);
    expect(snapshot.heapUsedMb).toBeGreaterThan(0);
  });

  it('should execute CLI ps, worker start/stop/restart/kill, and telemetry commands cleanly', async () => {
    const cli = new SeOsCli();
    await cli.boot('./non_existent_config.json');
    await cli.ps();
    await cli.workerStart('emp-dave');
    await cli.workerRestart('emp-dave');
    await cli.workerStop('emp-dave');
    await cli.telemetry();
    await cli.shutdown();
  });
});
