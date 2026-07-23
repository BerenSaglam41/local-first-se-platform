import { Project } from '../models/project';
import { Task } from '../models/task';
import { ExecutionRecord, TokenMetrics, ResourceMetrics, TelemetryData } from '../models/telemetry';

export interface IStorage {
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // Transactions
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
  
  // Projects
  createProject(project: Project): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  
  // Tasks
  createTask(task: Task): Promise<void>;
  getTask(id: string): Promise<Task | null>;
  updateTask(task: Task): Promise<void>;
  listTasksByProject(projectId: string): Promise<Task[]>;

  // Telemetry
  saveExecutionRecord(record: ExecutionRecord): Promise<void>;
  saveTokenMetrics(metrics: TokenMetrics): Promise<void>;
  saveResourceMetrics(metrics: ResourceMetrics): Promise<void>;
  getTelemetryByExecution(executionId: string): Promise<TelemetryData | null>;
  listTelemetry(): Promise<TelemetryData[]>;
}
