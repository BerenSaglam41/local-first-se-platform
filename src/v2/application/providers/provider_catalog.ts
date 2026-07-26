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
    authStatusArgs: ['login', 'status'],
    buildArgs: (prompt) => {
      const flags = process.env.CODEX_FLAGS ? process.env.CODEX_FLAGS.trim().split(/\s+/) : ['exec'];
      return [...flags, prompt];
    },
  },
  {
    id: 'plugin-gemini-cli',
    name: 'Gemini CLI',
    command: 'gemini',
    envVarName: 'GEMINI_PATH',
    buildArgs: (prompt) => {
      const flags = process.env.GEMINI_FLAGS ? process.env.GEMINI_FLAGS.trim().split(/\s+/) : ['-p'];
      return [...flags, prompt];
    },
  },
  {
    id: 'plugin-antigravity',
    name: 'Antigravity AI Engine',
    command: 'antigravity',
    envVarName: 'ANTIGRAVITY_PATH',
    buildArgs: (prompt) => {
      const flags = process.env.ANTIGRAVITY_FLAGS ? process.env.ANTIGRAVITY_FLAGS.trim().split(/\s+/) : ['-p'];
      return [...flags, prompt];
    },
  },
  {
    id: 'plugin-openai-cli',
    name: 'OpenAI CLI',
    command: 'openai',
    envVarName: 'OPENAI_CLI_PATH',
    buildArgs: (prompt) => {
      const flags = process.env.OPENAI_FLAGS ? process.env.OPENAI_FLAGS.trim().split(/\s+/) : ['-p'];
      return [...flags, prompt];
    },
  },
  {
    id: 'plugin-ollama',
    name: 'Ollama Local Runtime',
    command: 'ollama',
    envVarName: 'OLLAMA_PATH',
    buildArgs: (prompt) => {
      const flags = process.env.OLLAMA_FLAGS ? process.env.OLLAMA_FLAGS.trim().split(/\s+/) : ['run', process.env.OLLAMA_MODEL || 'llama3'];
      return [...flags, prompt];
    },
  },
];
