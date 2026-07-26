import React from 'react';
import { Box, Text } from 'ink';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';

interface DashboardTabProps {
  snapshot: TelemetrySnapshot;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ snapshot }) => {
  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Box borderStyle="round" borderColor="green" padding={1} flexDirection="column">
        <Text bold color="green">CURRENT PROJECT</Text>
        <Text color="white">{snapshot.businessGoal || 'No project started yet.'}</Text>
        <Box justifyContent="space-between" marginTop={1}>
          <Text color="cyan">Stage: {snapshot.currentStage || 'Waiting'}</Text>
          <Text bold color="yellow">Progress: {snapshot.progressPercent}%</Text>
          <Text color="green">Checks: {snapshot.verification?.qualityScore || 0}/100</Text>
        </Box>
      </Box>

      <Box marginTop={1} gap={1}>
        <Box flexDirection="column" width="50%" borderStyle="single" borderColor="cyan" padding={1}>
          <Text bold color="cyan" underline>WHAT THE TEAM IS DOING</Text>
          {snapshot.tasks.map((task) => (
            <Box key={task.id} justifyContent="space-between">
              <Text color={task.status === 'COMPLETED' ? 'green' : task.status === 'FAILED' ? 'red' : 'cyan'}>
                [{task.status === 'COMPLETED' ? '✓' : task.status === 'FAILED' ? '!' : '•'}] {task.title}
              </Text>
              <Text color="gray">{task.status}</Text>
            </Box>
          ))}
          {snapshot.tasks.length === 0 && <Text color="gray">Start a project from the main menu.</Text>}
        </Box>

        <Box flexDirection="column" width="50%" borderStyle="single" borderColor="yellow" padding={1}>
          <Text bold color="yellow" underline>YOUR TEAM</Text>
          {snapshot.workers.map((w) => (
            <Box key={w.id} justifyContent="space-between">
              <Text color="white">{w.name} ({w.role})</Text>
              <Text color="cyan">{w.assignedProvider || w.runtimeProvider}</Text>
              <Text color={w.status === 'BUSY' ? 'green' : 'gray'}>[{w.status}]</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
