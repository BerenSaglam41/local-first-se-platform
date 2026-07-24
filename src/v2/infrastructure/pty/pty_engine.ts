import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface PtyDimensions {
  cols: number;
  rows: number;
}

export class PtyEngine extends EventEmitter {
  private isAttached: boolean = true;
  private dimensions: PtyDimensions = { cols: 80, rows: 24 };

  constructor(private child: ChildProcess) {
    super();
    if (this.child.stdout) {
      this.child.stdout.on('data', (chunk: Buffer) => {
        if (this.isAttached) {
          const text = chunk.toString('utf8');
          this.emit('data', text);
        }
      });
    }
    if (this.child.stderr) {
      this.child.stderr.on('data', (chunk: Buffer) => {
        if (this.isAttached) {
          const text = chunk.toString('utf8');
          this.emit('error', text);
        }
      });
    }
  }

  write(input: string): boolean {
    if (this.child.stdin && !this.child.stdin.destroyed) {
      return this.child.stdin.write(input);
    }
    return false;
  }

  resize(cols: number, rows: number): void {
    this.dimensions = { cols, rows };
    this.emit('resize', this.dimensions);
  }

  attach(): void {
    this.isAttached = true;
    this.emit('attach');
  }

  detach(): void {
    this.isAttached = false;
    this.emit('detach');
  }

  close(): void {
    if (!this.child.killed) {
      this.child.kill('SIGTERM');
    }
    this.emit('close');
  }

  getDimensions(): PtyDimensions {
    return this.dimensions;
  }

  isAttachedMode(): boolean {
    return this.isAttached;
  }
}
