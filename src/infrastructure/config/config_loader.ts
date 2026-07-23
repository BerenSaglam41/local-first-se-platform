import * as dotenv from 'dotenv';
import { z } from 'zod';
import { IConfig, AppConfig } from '../../core/domain/interfaces/iconfig';
import { ConfigurationException } from '../../core/domain/errors/exceptions';

dotenv.config();

const configSchema = z.object({
  PORT: z.preprocess((val) => {
    if (val === undefined || val === '') return undefined;
    const parsed = parseInt(val as string, 10);
    return isNaN(parsed) ? undefined : parsed;
  }, z.number().default(3000)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_PATH: z.string().default('./se_platform.db'),
  LOG_PATH: z.string().default('./logs/app.jsonl'),
  MAX_CONCURRENT_AGENTS: z.preprocess((val) => {
    if (val === undefined || val === '') return undefined;
    const parsed = parseInt(val as string, 10);
    return isNaN(parsed) ? undefined : parsed;
  }, z.number().default(5)),
  APPROVAL_MODE: z.enum(['interactive', 'automatic', 'disabled']).default('interactive'),
  DEFAULT_CONTEXT_BUDGET: z.preprocess((val) => {
    if (val === undefined || val === '') return undefined;
    const parsed = parseInt(val as string, 10);
    return isNaN(parsed) ? undefined : parsed;
  }, z.number().default(8192)),
  PROVIDER_TYPE: z.enum(['mock', 'claude']).default('mock'),
  CLAUDE_EXECUTABLE: z.string().default('claude'),
});

export class ConfigLoader implements IConfig {
  private config: AppConfig;

  constructor() {
    const parsed = configSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error('❌ Configuration validation failed:', parsed.error.format());
      throw new ConfigurationException('Invalid system configuration', parsed.error);
    }
    const data = parsed.data;
    this.config = {
      port: data.PORT,
      env: data.NODE_ENV,
      dbPath: data.DB_PATH,
      logPath: data.LOG_PATH,
      maxConcurrentAgents: data.MAX_CONCURRENT_AGENTS,
      approvalMode: data.APPROVAL_MODE,
      defaultContextBudget: data.DEFAULT_CONTEXT_BUDGET,
      providerType: data.PROVIDER_TYPE,
      claudeExecutable: data.CLAUDE_EXECUTABLE,
    };
  }

  get(): AppConfig {
    return this.config;
  }
}
