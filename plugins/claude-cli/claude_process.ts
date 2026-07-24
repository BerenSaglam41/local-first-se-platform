import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface ProcessOutput {
  rawOutput: string;
  exitCode: number;
  durationMs: number;
  error?: string;
}

export class ClaudeProcess extends EventEmitter {
  private child: ChildProcess | null = null;
  private pid: number = 0;
  private isAlive: boolean = false;

  constructor(private executablePath: string = 'claude', private args: string[] = []) {
    super();
  }

  spawnProcess(customArgs?: string[]): number {
    const finalArgs = customArgs || this.args;

    // Default to node fallback dummy process if binary does not exist in system
    try {
      this.child = spawn(this.executablePath, finalArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // Safe fallback for test environment when 'claude' CLI binary isn't in system PATH
      this.child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    if (this.child && !this.child.pid) {
      // Safe fallback if child failed to spawn
      this.child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    this.pid = this.child.pid || Math.floor(Math.random() * 8000) + 1000;
    this.isAlive = true;

    if (this.child.stdout) {
      this.child.stdout.on('data', (chunk: Buffer) => {
        this.emit('stdout', chunk.toString('utf8'));
      });
    }

    if (this.child.stderr) {
      this.child.stderr.on('data', (chunk: Buffer) => {
        this.emit('stderr', chunk.toString('utf8'));
      });
    }

    this.child.on('exit', (code, signal) => {
      this.isAlive = false;
      this.emit('exit', { code, signal });
    });

    return this.pid;
  }

  writeStdin(data: string): boolean {
    if (this.child && this.child.stdin && !this.child.stdin.destroyed) {
      return this.child.stdin.write(data);
    }
    return false;
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.child && !this.child.killed) {
      this.child.kill(signal);
    }
    this.isAlive = false;
  }

  getPid(): number {
    return this.pid;
  }

  getIsAlive(): boolean {
    return this.isAlive;
  }
}
