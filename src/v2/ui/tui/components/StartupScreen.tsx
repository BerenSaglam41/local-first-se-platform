import React from 'react';
import { Box, Text, useInput } from 'ink';
import { TelemetrySnapshot } from '../../../contracts/itelemetry_aggregator';

interface StartupScreenProps {
  snapshot: TelemetrySnapshot;
  onContinue: () => void;
}

export const StartupScreen: React.FC<StartupScreenProps> = ({ snapshot, onContinue }) => {
  useInput((_input: string, key: any) => {
    if (key.return || key.rightArrow || _input === ' ') {
      onContinue();
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="double" borderColor="cyan">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">
          SE-OS v2.0 — Local First Software Engineering Operating System
        </Text>
        <Text color="green">
          Kernel Status: {snapshot.metrics.kernelStatus} (SQLite EventStore & SharedMemory Active)
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1} padding={1} borderStyle="single" borderColor="gray">
        <Text bold underline color="yellow">
          Detected Runtime Providers:
        </Text>
        {snapshot.runtimeProviders.map((provider) => (
          <Box key={provider.id} gap={1}>
            {provider.installed ? (
              <Text color="green">[✓] {provider.name} ({provider.version}) - Ready</Text>
            ) : (
              <Text color="gray">[✗] {provider.name} - Not Found</Text>
            )}
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="cyan" bold>
          [ Press ENTER or SPACE to Select Active Runtime Provider ]
        </Text>
      </Box>
    </Box>
  );
};
