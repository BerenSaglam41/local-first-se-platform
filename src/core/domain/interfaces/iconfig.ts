export interface AppConfig {
  port: number;
  env: string;
  dbPath: string;
  logPath: string;
  maxConcurrentAgents: number;
  approvalMode: 'interactive' | 'automatic' | 'disabled';
  defaultContextBudget: number;
  providerType: 'mock' | 'claude';
  claudeExecutable?: string;
  verificationCommands: string[];
  maxRetryCount: number;
}

export interface IConfig {
  get(): AppConfig;
}
