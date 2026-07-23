import { GitManager } from '../src/core/application/services/git_manager';
import { IProcessRuntime } from '../src/core/domain/interfaces/iprocess_runtime';
import { EventEmitter } from 'events';

class MockExecutionHandle extends EventEmitter {
  constructor(private exitCode: number, private stdout: string, private stderr: string = '') {
    super();
  }
  async wait() {
    if (this.stdout) {
      this.emit('stdout', this.stdout);
    }
    if (this.stderr) {
      this.emit('stderr', this.stderr);
    }
    return {
      state: 'FINISHED',
      exitCode: this.exitCode,
      metrics: { durationMs: 10, pid: 123 },
    };
  }
}

describe('GitManager Service', () => {
  let mockRuntime: any;

  beforeEach(() => {
    mockRuntime = {
      execute: jest.fn(),
    };
  });

  it('should detect repository root successfully', async () => {
    const manager = new GitManager(mockRuntime);
    mockRuntime.execute.mockImplementation(() => {
      return new MockExecutionHandle(0, '/Users/test/workspace\n');
    });

    const root = await manager.getRepositoryRoot();
    expect(root).toBe('/Users/test/workspace');
  });

  it('should detect repository status', async () => {
    const manager = new GitManager(mockRuntime);
    mockRuntime.execute.mockImplementation(() => {
      return new MockExecutionHandle(0, ' M src/index.ts\n?? newfile.ts\n');
    });

    const status = await manager.getStatus();
    expect(status.isClean).toBe(false);
    expect(status.modifiedFiles).toContain('src/index.ts');
    expect(status.modifiedFiles).toContain('newfile.ts');
  });

  it('should stage and commit files successfully', async () => {
    const manager = new GitManager(mockRuntime);
    mockRuntime.execute.mockImplementation((opts: any) => {
      if (opts.args[0] === 'rev-parse' && opts.args[1] === 'HEAD') {
        return new MockExecutionHandle(0, 'commit-hash-123\n');
      }
      return new MockExecutionHandle(0, '');
    });

    const res = await manager.commit(['src/index.ts'], 'feat(core): test commit');
    expect(res.success).toBe(true);
    expect(res.commitHash).toBe('commit-hash-123');
  });
});
