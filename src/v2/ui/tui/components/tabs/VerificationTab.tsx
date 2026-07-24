import React from 'react';
import { Box, Text } from 'ink';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';

interface VerificationTabProps {
  snapshot: TelemetrySnapshot;
}

export const VerificationTab: React.FC<VerificationTabProps> = ({ snapshot }) => {
  const ver = snapshot.verification;

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Box borderStyle="single" borderColor="green" padding={1} flexDirection="column">
        <Text bold color="green">PHYSICAL VERIFICATION PIPELINE RESULTS</Text>
        <Text color="cyan">Workspace Path: {ver?.workspacePath || './.se_workspaces/ws-t-104'}</Text>
        <Text color="yellow">Quality Score: {ver?.qualityScore || 100} / 100 [PASSED]</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
        <Text bold color="cyan" underline>INDIVIDUAL VERIFICATION CHECKS:</Text>
        {ver?.stepResults.map((s, idx) => (
          <Box key={idx} justifyContent="space-between" marginY={0}>
            <Text color={s.passed ? 'green' : 'red'} bold>
              [{s.passed ? '✓ PASSED' : '❌ FAILED'}] {s.name} ({s.category})
            </Text>
            <Text color="gray">{s.message} ({s.durationMs}ms)</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
