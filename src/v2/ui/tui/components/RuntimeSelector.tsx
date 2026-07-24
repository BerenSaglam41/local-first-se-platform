import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { TelemetrySnapshot } from '../../../contracts/itelemetry_aggregator';

interface RuntimeSelectorProps {
  snapshot: TelemetrySnapshot;
  onSelectRuntime: (providerId: string) => void;
}

export const RuntimeSelector: React.FC<RuntimeSelectorProps> = ({ snapshot, onSelectRuntime }) => {
  const items = snapshot.runtimeProviders
    .filter((p) => p.installed)
    .map((p) => ({
      label: `${p.name} (Active: ${p.active ? 'YES' : 'NO'})`,
      value: p.id,
    }));

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Text bold color="cyan">
        Select Active Runtime Provider for Autonomous Workers:
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item: { label: string; value: string }) => onSelectRuntime(item.value)}
        />
      </Box>
    </Box>
  );
};
