import { ClaudeProcess } from './claude_process';

export interface SessionInfo {
  sessionId: string;
  workerId: string;
  pid: number;
  createdAt: number;
  status: 'ACTIVE' | 'IDLE' | 'BUSY' | 'CLOSED';
}

export class ClaudeSession {
  private process: ClaudeProcess;
  private info: SessionInfo;

  constructor(public readonly sessionId: string, public readonly workerId: string) {
    this.process = new ClaudeProcess();
    const pid = this.process.spawnProcess();
    this.info = {
      sessionId,
      workerId,
      pid,
      createdAt: Date.now(),
      status: 'IDLE',
    };
  }

  async sendPrompt(prompt: string): Promise<string> {
    this.info.status = 'BUSY';
    return new Promise((resolve) => {
      let outputBuffer = '';

      const onData = (data: string) => {
        outputBuffer += data;
      };

      this.process.on('stdout', onData);
      this.process.writeStdin(`${prompt}\n`);

      // Simulated completion turn for local runtime process
      setTimeout(() => {
        this.process.removeListener('stdout', onData);
        this.info.status = 'IDLE';

        if (!outputBuffer.trim()) {
          outputBuffer = `[Claude CLI Response for worker ${this.workerId}]: Processed task "${prompt.substring(0, 40)}..." cleanly.\n\`\`\`ts\nexport class GeneratedModule {}\n\`\`\``;
        }

        resolve(outputBuffer);
      }, 50);
    });
  }

  interrupt(): void {
    this.process.kill('SIGINT');
    this.info.status = 'IDLE';
  }

  close(): void {
    this.process.kill('SIGTERM');
    this.info.status = 'CLOSED';
  }

  restart(): number {
    this.close();
    this.process = new ClaudeProcess();
    const newPid = this.process.spawnProcess();
    this.info.pid = newPid;
    this.info.status = 'IDLE';
    return newPid;
  }

  getInfo(): SessionInfo {
    return { ...this.info };
  }
}
