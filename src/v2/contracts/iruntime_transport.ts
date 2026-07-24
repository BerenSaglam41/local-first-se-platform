import { EventEmitter } from 'events';

export interface TransportDimensions {
  cols: number;
  rows: number;
}

export type TransportType = 'PTY' | 'STDIO' | 'TMUX' | 'CONTAINER' | 'REMOTE' | 'SSH';

export interface IRuntimeTransport extends EventEmitter {
  /** Transport identifier / backend name */
  readonly transportType: TransportType;

  /** Write input string to the transport stdin stream */
  write(data: string): boolean;

  /** Resize terminal dimensions (if supported by transport) */
  resize?(dimensions: TransportDimensions): void;

  /** Attach listeners/readers to transport */
  attach?(): void;

  /** Detach listeners/readers from transport */
  detach?(): void;

  /** Terminate transport connection / process */
  close(): void;

  /** Returns true if transport is attached */
  isAttachedMode?(): boolean;

  /** Get current terminal dimensions */
  getDimensions?(): TransportDimensions;
}
