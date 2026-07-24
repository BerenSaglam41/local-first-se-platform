import { WorkspaceMetadata } from '../models/workspace';

export interface IWorkspaceManager {
  resolveWorkspace(inputPath: string): Promise<WorkspaceMetadata>;
}
