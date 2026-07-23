import * as fs from 'fs';
import * as path from 'path';
import { ILogger, LogMetadata } from '../../core/domain/interfaces/ilogger';
import { IConfig } from '../../core/domain/interfaces/iconfig';

export class JsonLogger implements ILogger {
  private logPath: string;

  constructor(config: IConfig) {
    this.logPath = config.get().logPath;
    this.ensureLogDir();
  }

  private ensureLogDir() {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private writeLog(level: string, message: string, error?: Error | unknown, meta?: LogMetadata) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(error ? { error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error } : {}),
      ...meta,
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    try {
      fs.appendFileSync(this.logPath, logLine, 'utf8');
      
      // Also write color-coded text log to stdout for real-time observability in development
      const color = level === 'ERROR' ? '\x1b[31m' : level === 'WARN' ? '\x1b[33m' : level === 'DEBUG' ? '\x1b[90m' : '\x1b[36m';
      const reset = '\x1b[0m';
      console.log(`${color}[${level}]${reset} ${message} ${meta ? JSON.stringify(meta) : ''}`);
    } catch (err) {
      console.error('Failed to write log line:', err);
    }
  }

  debug(message: string, meta?: LogMetadata): void {
    this.writeLog('DEBUG', message, undefined, meta);
  }

  info(message: string, meta?: LogMetadata): void {
    this.writeLog('INFO', message, undefined, meta);
  }

  warn(message: string, meta?: LogMetadata): void {
    this.writeLog('WARN', message, undefined, meta);
  }

  error(message: string, error?: Error | unknown, meta?: LogMetadata): void {
    this.writeLog('ERROR', message, error, meta);
  }
}
