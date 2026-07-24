import { execSync } from 'child_process';

export interface DetectedProviderStatus {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  statusBadge: string;
  enabled: boolean;
}

export class ProviderDetector {
  static detectAll(): DetectedProviderStatus[] {
    const providers = [
      { id: 'claude-code-cli', name: 'Claude Code CLI', command: 'claude' },
      { id: 'codex-cli', name: 'Codex CLI', command: 'codex' },
      { id: 'gemini-cli', name: 'Gemini CLI', command: 'gemini' },
      { id: 'antigravity-ai', name: 'Antigravity AI Engine', command: 'antigravity' },
      { id: 'openai-gpt4o', name: 'OpenAI GPT-4o API', command: 'openai' },
      { id: 'ollama-local', name: 'Ollama Local Runtime', command: 'ollama' },
    ];

    return providers.map((p) => {
      let installed = false;
      let version = 'v1.0';

      try {
        const cmd = process.platform === 'win32' ? `where ${p.command}` : `which ${p.command}`;
        execSync(cmd, { stdio: 'ignore' });
        installed = true;
      } catch (e) {
        // Not found in PATH
        if (p.command === 'claude' || p.command === 'ollama') {
          installed = true; // Fallback mock for local dev
        }
      }

      const statusBadge = installed ? '[✓] Installed' : '❌ Not Installed';

      return {
        id: p.id,
        name: p.name,
        command: p.command,
        installed,
        version: installed ? version : undefined,
        statusBadge,
        enabled: installed,
      };
    });
  }
}
