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
}

export interface IConfig {
  get(): AppConfig;
}
