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
        <Text bold color="green">PROJECT GOAL: "{snapshot.businessGoal}" [{snapshot.projectId}]</Text>
        <Box justifyContent="space-between" marginTop={1}>
          <Text color="cyan">Stage: {snapshot.currentStage}</Text>
          <Text bold color="yellow">Progress: {snapshot.progressPercent}%</Text>
          <Text color="green">Quality Score: {snapshot.verification?.qualityScore || 100}/100</Text>
        </Box>
      </Box>

      <Box marginTop={1} gap={1}>
        <Box flexDirection="column" width="50%" borderStyle="single" borderColor="cyan" padding={1}>
          <Text bold color="cyan" underline>EXECUTED MISSION TASKS (DAG):</Text>
          {snapshot.tasks.map((task) => (
            <Box key={task.id} justifyContent="space-between">
              <Text color={task.status === 'COMPLETED' ? 'green' : 'cyan'}>
                [{task.status === 'COMPLETED' ? '✓' : '▶'}] {task.title}
              </Text>
              <Text color="gray">{task.priority}</Text>
            </Box>
          ))}
        </Box>

        <Box flexDirection="column" width="50%" borderStyle="single" borderColor="yellow" padding={1}>
          <Text bold color="yellow" underline>ACTIVE WORKER TEAM:</Text>
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
