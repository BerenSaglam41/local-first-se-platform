import { EventEmitter } from 'events';
import { IRuntimeTransport, TransportDimensions, TransportType } from '../../contracts/iruntime_transport';
import { PtyEngine } from '../pty/pty_engine';

export class PtyTransport extends EventEmitter implements IRuntimeTransport {
  readonly transportType: TransportType = 'PTY';

  constructor(private ptyEngine: PtyEngine) {
    super();

    this.ptyEngine.on('data', (text: string) => {
      this.emit('data', text);
    });

    this.ptyEngine.on('error', (text: string) => {
      this.emit('error', text);
    });

    this.ptyEngine.on('close', () => {
      this.emit('close');
    });

    this.ptyEngine.on('resize', (dims: TransportDimensions) => {
      this.emit('resize', dims);
    });
  }

  write(data: string): boolean {
    return this.ptyEngine.write(data);
  }

  resize(dimensions: TransportDimensions): void {
    this.ptyEngine.resize(dimensions.cols, dimensions.rows);
  }

  attach(): void {
    this.ptyEngine.attach();
  }

  detach(): void {
    this.ptyEngine.detach();
  }

  close(): void {
    this.ptyEngine.close();
  }

  isAttachedMode(): boolean {
    return this.ptyEngine.isAttachedMode();
  }

  getDimensions(): TransportDimensions {
    return this.ptyEngine.getDimensions();
  }
}
