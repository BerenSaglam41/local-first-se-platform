export type ProjectType = 'Node.js' | 'Python' | 'Rust' | 'Go' | 'Java' | 'Unknown';

export interface WorkspaceMetadata {
  name: string;
  rootPath: string;
  projectType: ProjectType;
  manifestFile?: string;
  buildCommand?: string;
  testCommand?: string;
  verificationCommands: string[];
}
