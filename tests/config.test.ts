import { ConfigLoader } from '../src/infrastructure/config/config_loader';
import { ConfigurationException } from '../src/core/domain/errors/exceptions';

describe('Configuration Loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load default values when environment is empty', () => {
    // Delete keys to force defaults
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.DB_PATH;
    delete process.env.LOG_PATH;

    const loader = new ConfigLoader();
    const config = loader.get();

    expect(config.port).toBe(3000);
    expect(config.env).toBe('development');
    expect(config.dbPath).toBe('./se_platform.db');
    expect(config.logPath).toBe('./logs/app.jsonl');
    expect(config.maxConcurrentAgents).toBe(5);
    expect(config.approvalMode).toBe('interactive');
    expect(config.defaultContextBudget).toBe(8192);
  });

  it('should override configuration defaults with environment variables', () => {
    process.env.PORT = '8080';
    process.env.NODE_ENV = 'production';
    process.env.DB_PATH = '/path/to/test.db';
    process.env.LOG_PATH = '/path/to/test.jsonl';
    process.env.MAX_CONCURRENT_AGENTS = '10';
    process.env.APPROVAL_MODE = 'automatic';
    process.env.DEFAULT_CONTEXT_BUDGET = '4096';

    const loader = new ConfigLoader();
    const config = loader.get();

    expect(config.port).toBe(8080);
    expect(config.env).toBe('production');
    expect(config.dbPath).toBe('/path/to/test.db');
    expect(config.logPath).toBe('/path/to/test.jsonl');
    expect(config.maxConcurrentAgents).toBe(10);
    expect(config.approvalMode).toBe('automatic');
    expect(config.defaultContextBudget).toBe(4096);
  });

  it('should throw ConfigurationException on invalid environment values', () => {
    process.env.NODE_ENV = 'invalid_env'; // Should be 'development', 'production', or 'test'
    expect(() => {
      new ConfigLoader();
    }).toThrow(ConfigurationException);
  });
});
