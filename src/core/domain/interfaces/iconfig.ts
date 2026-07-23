export interface AppConfig {
  port: number;
  env: string;
  dbPath: string;
  logPath: string;
  maxConcurrentAgents: number;
  approvalMode: 'interactive' | 'automatic' | 'disabled';
  defaultContextBudget: number;
}

export interface IConfig {
  get(): AppConfig;
}
