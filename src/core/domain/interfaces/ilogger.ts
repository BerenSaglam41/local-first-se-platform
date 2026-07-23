export interface LogMetadata {
  traceId?: string;
  correlationId?: string;
  taskId?: string;
  workflowId?: string;
  providerId?: string;
  agentId?: string;
  [key: string]: any;
}

export interface ILogger {
  debug(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  error(message: string, error?: Error | unknown, meta?: LogMetadata): void;
}
