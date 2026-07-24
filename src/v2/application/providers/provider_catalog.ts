import { CliRuntimePluginConfig } from '../plugins/cli_runtime_plugin';

/**
 * The set of CLI-backed providers SE-OS knows how to detect and (if installed) run.
 * `plugin-claude-code` is intentionally excluded — it has its own bespoke plugin
 * (ClaudeCodeRuntimePlugin) with verified real `--session-id`/`--resume` support.
 *
 * Argument conventions for the CLIs below were not all independently verifiable in this
 * environment (only `claude` was actually installed to test against). Where the underlying
 * tool's real non-interactive/"print" flag is well-documented (Codex, Gemini, Ollama) it's used;
 * everything else falls back to the same `-p <prompt>` convention `claude` actually uses, and is
 * marked unverified below. Detection is always real regardless (never reports a CLI as installed
 * unless it genuinely resolves and runs on this machine); execution always really spawns the
 * process and returns its real output or a real, honest error — a wrong flag surfaces as a real
 * CLI error, never a fabricated success.
 */
export const PROVIDER_CATALOG: CliRuntimePluginConfig[] = [
  {
    id: 'plugin-codex-cli',
    name: 'Codex CLI',
    command: 'codex',
    envVarName: 'CODEX_PATH',
    buildArgs: (prompt) => ['exec', prompt],
  },
  {
    id: 'plugin-gemini-cli',
    name: 'Gemini CLI',
    command: 'gemini',
    envVarName: 'GEMINI_PATH',
    buildArgs: (prompt) => ['-p', prompt],
  },
  {
    id: 'plugin-antigravity',
    name: 'Antigravity AI Engine',
    command: 'antigravity',
    envVarName: 'ANTIGRAVITY_PATH',
    buildArgs: (prompt) => ['-p', prompt], // unverified convention
  },
  {
    id: 'plugin-openai-cli',
    name: 'OpenAI CLI',
    command: 'openai',
    envVarName: 'OPENAI_CLI_PATH',
    buildArgs: (prompt) => ['-p', prompt], // unverified convention
  },
  {
    id: 'plugin-ollama',
    name: 'Ollama Local Runtime',
    command: 'ollama',
    envVarName: 'OLLAMA_PATH',
    buildArgs: (prompt) => ['run', process.env.OLLAMA_MODEL || 'llama3', prompt],
  },
];
