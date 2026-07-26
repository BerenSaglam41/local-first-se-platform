import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { TelemetrySnapshot } from '../../../contracts/itelemetry_aggregator.js';

interface RuntimeSelectorProps {
  snapshot: TelemetrySnapshot;
  onSelectRuntime: (providerId: string) => void;
}

export const RuntimeSelector: React.FC<RuntimeSelectorProps> = ({ snapshot, onSelectRuntime }) => {
  const items = snapshot.runtimeProviders
    .filter((p: any) => p.installed)
    .map((p: any) => ({
      label: p.active
        ? `⭐️ ${p.name}  [PRIMARY SELECTED RUNTIME]`
        : `   ${p.name}  [Press ENTER to set as Primary]`,
      value: p.id,
    }));

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Text bold color="cyan">
        Select Active Primary Runtime Provider for Autonomous Workers:
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={items.length > 0 ? items : [{ label: 'Claude Code CLI (Default Fallback)', value: 'plugin-claude-code' }]}
          onSelect={(item: { label: string; value: string }) => onSelectRuntime(item.value)}
        />
      </Box>
      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold color="yellow">
          🔑 Provider Authentication & Setup Guide:
        </Text>
        <Text color="gray">
          • Google Gemini CLI: Set GEMINI_API_KEY in .env or authenticate via Google OAuth (gcloud / gemini auth login).
        </Text>
        <Text color="gray">
          • Claude Code CLI: Set ANTHROPIC_API_KEY in .env or run 'claude login'.
        </Text>
        <Text color="gray">
          • Codex / OpenAI CLI: Set OPENAI_API_KEY in .env.
        </Text>
        <Text color="gray">
          • Antigravity AI Engine: Set ANTIGRAVITY_API_KEY in .env.
        </Text>
      </Box>
    </Box>
  );
};
