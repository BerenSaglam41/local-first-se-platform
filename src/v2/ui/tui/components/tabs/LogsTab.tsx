import React from 'react';
import { Box, Text } from 'ink';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';

interface LogsTabProps {
  snapshot: TelemetrySnapshot;
}

export const LogsTab: React.FC<LogsTabProps> = ({ snapshot }) => {
  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Text bold color="yellow" underline>SYSTEM CONSOLE FEED & DOMAIN EVENT STORE STREAM:</Text>
      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        {snapshot.systemConsoleLogs.map((log) => (
          <Text key={log.id} color={log.level === 'SUCCESS' ? 'green' : log.level === 'ERROR' ? 'red' : 'gray'}>
            [{log.timestamp}] [{log.level}] {log.message}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
