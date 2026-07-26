import React from 'react';
import { Box, Text } from 'ink';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';

interface DashboardTabProps {
  snapshot: TelemetrySnapshot;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ snapshot }) => {
  const failedTasks = snapshot.tasks.filter((task) => task.status === 'FAILED');
  const busyWorkers = snapshot.workers.filter((worker) => worker.status === 'BUSY');
  const verificationFailed = snapshot.verification && !snapshot.verification.success;

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Box borderStyle="round" borderColor="green" padding={1} flexDirection="column">
        <Text bold color="green">CEO OVERVIEW  /  CURRENT PROJECT</Text>
        <Text color="white">{snapshot.businessGoal || 'No project started yet.'}</Text>
        <Box justifyContent="space-between" marginTop={1}>
          <Text color="cyan">Stage: {snapshot.currentStage || 'Waiting'}</Text>
          <Text bold color="yellow">Progress: {snapshot.progressPercent}%</Text>
          <Text color={verificationFailed ? 'red' : 'green'}>Checks: {snapshot.verification ? `${snapshot.verification.qualityScore}/100` : 'not run'}</Text>
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor={failedTasks.length || verificationFailed ? 'red' : 'blue'} padding={1} flexDirection="column">
        <Text bold color={failedTasks.length || verificationFailed ? 'red' : 'blue'}>YOUR NEXT ACTION</Text>
        {failedTasks.length > 0 ? <Text color="red">Review failed tasks: {failedTasks.map((task) => task.title).join(', ')}</Text> : verificationFailed ? <Text color="red">Verification found issues. Open Checks for the exact errors.</Text> : snapshot.projectStatus === 'COMPLETED' ? <Text color="green">Review the completed workspace and send the next command in Command.</Text> : busyWorkers.length > 0 ? <Text color="cyan">The team is working. Watch progress here or inspect live output in Terminals.</Text> : <Text color="gray">Start or continue work from Command. You decide the goal; the team handles planning and execution.</Text>}
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
          {snapshot.tasks.length === 0 && <Text color="gray">No tasks yet. Use 5 Command to start.</Text>}
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
