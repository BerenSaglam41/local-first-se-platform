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
    .sort((a: any, b: any) => Number(b.active) - Number(a.active))
    .map((p: any) => ({
      label: p.active
        ? `⭐️ ${p.name}  [PRIMARY / ${p.authentication || 'UNKNOWN'}]`
        : `   ${p.name}  [${p.authentication || 'UNKNOWN'}]`,
      value: p.id,
    }));

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Text bold color="cyan">
          Select Active Primary CLI Provider for Autonomous Workers:
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={items.length > 0 ? items : [{ label: 'Claude Code CLI (Default Fallback)', value: 'plugin-claude-code' }]}
          onSelect={(item: { label: string; value: string }) => onSelectRuntime(item.value)}
        />
      </Box>
      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold color="yellow">
          🔑 Local CLI Authentication Guide:
        </Text>
        <Text color="gray">
          • Gemini CLI: install it and login locally with the provider's CLI login flow.
        </Text>
        <Text color="gray">
          • Claude Code CLI: run 'claude login' once in your terminal.
        </Text>
        <Text color="gray">
          • Codex CLI: login with the local Codex CLI account/session.
        </Text>
        <Text color="gray">
          • Antigravity: install its CLI and login locally before assigning it to a worker.
        </Text>
      </Box>
    </Box>
  );
};
