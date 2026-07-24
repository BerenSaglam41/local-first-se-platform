import { Kernel } from '../../src/v2/kernel/kernel';
import { SqliteEventStore } from '../../src/v2/infrastructure/storage/sqlite_event_store';
import { SqliteSharedMemory } from '../../src/v2/infrastructure/storage/sqlite_shared_memory';
import { SeOsCli } from '../../src/v2/cli/se_os_cli';
import { createFakeClaudeSpawner, createAvailableDetector , createSafeTestProviderOverrides } from './helpers/fake_claude_process';
import * as fs from 'fs';
import * as path from 'path';

describe('SE-OS v2.0 Milestone 1 — Kernel Bootstrap Suite', () => {
  const testDbPath = './se_company_test.db';
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

  it('should boot Kernel successfully and initialize default workforce', async () => {
    await kernel.boot('./non_existent_config.json');

    expect(kernel.isReady()).toBe(true);
    const workers = kernel.getWorkerStore().list();

    expect(workers.length).toBe(5); // Alice, Bob, Charlie, Diana, Eve
    expect(workers[0].name).toBe('Alice');
    expect(workers[0].role).toBe('Lead Architect');
    expect(workers[1].name).toBe('Bob');
    expect(workers[1].role).toBe('Backend Engineer');
    expect(workers[2].name).toBe('Charlie');
    expect(workers[2].role).toBe('QA Engineer');
    expect(workers[3].name).toBe('Diana');
    expect(workers[3].role).toBe('Documentation Engineer');
    expect(workers[4].name).toBe('Eve');
    expect(workers[4].role).toBe('Research Engineer');
  });

  it('should spawn, list, stop, and restart workers via LocalProcessSupervisor', async () => {
    await kernel.boot('./non_existent_config.json');
    const supervisor = kernel.getSupervisor();
    const workerStore = kernel.getWorkerStore();

    const newWorker = supervisor.spawnWorker({
      id: 'emp-dave',
      name: 'Dave',
      role: 'Research Engineer',
      department: 'Research',
    });

    expect(newWorker.process.pid).toBeGreaterThan(0);
    expect(workerStore.list().length).toBe(6);

    const restarted = supervisor.restartWorker('emp-dave');
    expect(restarted).toBeDefined();
    expect(restarted?.processState).toBe('IDLE');

    const stopped = supervisor.stopWorker('emp-dave');
    expect(stopped).toBe(true);
    expect(workerStore.list().length).toBe(5);
  });


  it('should persist domain events in SQLite Event Store and replay stream', async () => {
    const eventStore = new SqliteEventStore(testDbPath);
    await eventStore.connect();

    await eventStore.append({
      eventId: 'evt-001',
      aggregateId: 'mission-auth',
      eventType: 'MissionCreated',
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'CEO',
      payload: { title: 'Implement JWT Auth' },
    });

    await eventStore.append({
      eventId: 'evt-002',
      aggregateId: 'mission-auth',
      eventType: 'TaskAssigned',
      version: 1,
      timestamp: new Date().toISOString(),
      actorId: 'emp-alice',
      payload: { assignedTo: 'emp-bob', file: 'src/auth/jwt.ts' },
    });

    const stream = await eventStore.readStream('mission-auth');
    expect(stream.length).toBe(2);
    expect(stream[0].eventType).toBe('MissionCreated');
    expect(stream[1].eventType).toBe('TaskAssigned');

    await eventStore.close();
  });

  it('should persist ADRs and Git checkpoints in SQLite Shared Memory', async () => {
    const memory = new SqliteSharedMemory(testDbPath);
    await memory.connect();

    await memory.writeADR({
      id: 'ADR-001',
      title: 'Use JWT for authentication',
      author: 'Alice',
      status: 'ACCEPTED',
      content: 'Decided to use RSA signed JWTs.',
      timestamp: new Date().toISOString(),
    });

    const adr = await memory.readADR('ADR-001');
    expect(adr).toBeDefined();
    expect(adr?.title).toBe('Use JWT for authentication');
    expect(adr?.status).toBe('ACCEPTED');

    const cpHash = await memory.writeGitCheckpoint('step-1', 'Initial commit');
    expect(cpHash).toContain('cp-');

    const gitStatus = await memory.getGitStatus();
    expect(gitStatus.activeCheckpoints['step-1']).toBe(cpHash);

    await memory.close();
  });

  it('should collect telemetry metrics and record heartbeats', async () => {
    await kernel.boot('./non_existent_config.json');
    const telemetry = kernel.getTelemetry();

    telemetry.recordHeartbeat();
    telemetry.recordHeartbeat();
    telemetry.recordMission();

    const snapshot = telemetry.getSnapshot(kernel.getWorkerStore().list(), 0);

    expect(snapshot.activeWorkerCount).toBe(5);
    expect(snapshot.totalMissions).toBe(1);
    expect(snapshot.heartbeatsCount).toBe(2);
    expect(snapshot.memoryRssMb).toBeGreaterThan(0);
  });


  it('should execute CLI commands via SeOsCli cleanly', async () => {
    const cli = new SeOsCli(createSafeTestProviderOverrides());
    await cli.boot('./non_existent_config.json');
    await cli.workers();
    await cli.status();
    await cli.shutdown();
  });
});
