export interface AiProviderConfig {
  id: string;
  name: string;
  version: string;
  installed: boolean;
  enabled: boolean;
}

export interface WorkerAssignmentConfig {
  workerId: string;
  workerName: string;
  role: string;
  assignedProviderId: string;
  workingDirectory: string;
  terminalPane: string;
}

export class ProviderManager {
  private providers: AiProviderConfig[] = [
    { id: 'claude-code-cli', name: 'Claude Code CLI', version: '2.1.218', installed: true, enabled: true },
    { id: 'codex-cli', name: 'Codex CLI', version: '1.4.0', installed: true, enabled: true },
    { id: 'gemini-cli', name: 'Gemini CLI', version: '1.2.0', installed: true, enabled: true },
    { id: 'antigravity-ai', name: 'Antigravity AI Engine', version: '2.0.0', installed: true, enabled: true },
    { id: 'openai-gpt4o', name: 'OpenAI GPT-4o API', version: '4.0.0', installed: true, enabled: true },
    { id: 'ollama-local', name: 'Ollama Local Runtime', version: '0.1.32', installed: true, enabled: true },
  ];

  private assignments: Map<string, WorkerAssignmentConfig> = new Map([
    ['emp-alice', { workerId: 'emp-alice', workerName: 'Alice', role: 'Lead Architect', assignedProviderId: 'claude-code-cli', workingDirectory: './src', terminalPane: 'tmux pane 1 (PID 48839)' }],
    ['emp-bob', { workerId: 'emp-bob', workerName: 'Bob', role: 'Backend Engineer', assignedProviderId: 'codex-cli', workingDirectory: './src/controllers', terminalPane: 'tmux pane 2 (PID 48840)' }],
    ['emp-charlie', { workerId: 'emp-charlie', workerName: 'Charlie', role: 'QA Engineer', assignedProviderId: 'gemini-cli', workingDirectory: './tests', terminalPane: 'tmux pane 3 (PID 48841)' }],
  ]);

  getProviders(): AiProviderConfig[] {
    return this.providers;
  }

  getAssignments(): WorkerAssignmentConfig[] {
    return Array.from(this.assignments.values());
  }

  setAssignment(workerId: string, providerId: string): void {
    const assign = this.assignments.get(workerId);
    if (assign) {
      assign.assignedProviderId = providerId;
    }
  }

  toggleProvider(providerId: string): void {
    const p = this.providers.find((item) => item.id === providerId);
    if (p) {
      p.enabled = !p.enabled;
    }
  }
}
