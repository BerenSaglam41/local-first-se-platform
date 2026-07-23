import * as fs from 'fs';
import * as path from 'path';
import { JsonLogger } from '../src/infrastructure/logging/json_logger';
import { IConfig } from '../src/core/domain/interfaces/iconfig';

describe('JSON Lines Structured Logger', () => {
  const tempLogPath = path.join(__dirname, 'temp_test_logs.jsonl');
  let mockConfig: IConfig;

  beforeEach(() => {
    mockConfig = {
      get: () => ({
        port: 3000,
        env: 'test',
        dbPath: './test.db',
        logPath: tempLogPath,
        maxConcurrentAgents: 5,
        approvalMode: 'automatic',
        defaultContextBudget: 4096,
        providerType: 'mock',
        claudeExecutable: 'claude',
        verificationCommands: ['npm run build', 'npm test'],
        maxRetryCount: 3,
      }),
    };
    if (fs.existsSync(tempLogPath)) {
      fs.unlinkSync(tempLogPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempLogPath)) {
      fs.unlinkSync(tempLogPath);
    }
  });

  it('should write logs in JSON Lines format with correct levels and metadata', () => {
    const logger = new JsonLogger(mockConfig);

    logger.info('System initiated', { traceId: 't-123', correlationId: 'c-456' });
    logger.error('Database connection failed', new Error('Timeout error'), { traceId: 't-123' });

    expect(fs.existsSync(tempLogPath)).toBe(true);

    const logLines = fs.readFileSync(tempLogPath, 'utf8').trim().split('\n');
    expect(logLines.length).toBe(2);

    const firstLog = JSON.parse(logLines[0]);
    expect(firstLog.level).toBe('INFO');
    expect(firstLog.message).toBe('System initiated');
    expect(firstLog.traceId).toBe('t-123');
    expect(firstLog.correlationId).toBe('c-456');
    expect(firstLog.timestamp).toBeDefined();

    const secondLog = JSON.parse(logLines[1]);
    expect(secondLog.level).toBe('ERROR');
    expect(secondLog.message).toBe('Database connection failed');
    expect(secondLog.error.message).toBe('Timeout error');
    expect(secondLog.error.stack).toBeDefined();
    expect(secondLog.traceId).toBe('t-123');
  });
});
