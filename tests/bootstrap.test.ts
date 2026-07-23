import * as fs from 'fs';
import * as path from 'path';
import { bootstrap } from '../src/main';
import { IStorage } from '../src/core/domain/interfaces/istorage';

describe('System Bootstrapper Integration', () => {
  const tempDbPath = path.join(__dirname, 'temp_bootstrap_test.db');
  const tempLogPath = path.join(__dirname, 'temp_bootstrap_test.jsonl');
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.DB_PATH = tempDbPath;
    process.env.LOG_PATH = tempLogPath;

    // Clean up files if they exist
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    if (fs.existsSync(tempLogPath)) fs.unlinkSync(tempLogPath);
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;

    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch (err) {}
    }
    if (fs.existsSync(tempLogPath)) {
      try {
        fs.unlinkSync(tempLogPath);
      } catch (err) {}
    }
  });

  it('should bootstrap the application kernel, register singletons, and run health check successfully', async () => {
    const { container, traceId } = await bootstrap();

    expect(traceId).toBeDefined();
    expect(container).toBeDefined();

    // Verify DI bindings
    const config = container.resolve('Config');
    const logger = container.resolve('Logger');
    const storage = container.resolve<IStorage>('Storage');

    expect(config).toBeDefined();
    expect(logger).toBeDefined();
    expect(storage).toBeDefined();

    // Verify that database file was created
    expect(fs.existsSync(tempDbPath)).toBe(true);

    // Verify that logs file was created
    expect(fs.existsSync(tempLogPath)).toBe(true);

    // Close connections to release file handles
    await storage.close();
  });
});
