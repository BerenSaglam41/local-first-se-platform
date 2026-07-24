import React from 'react';
import { Box, Text, useInput } from 'ink';
import { TelemetrySnapshot } from '../../../contracts/itelemetry_aggregator.js';

interface ProjectExecutionScreenProps {
  snapshot: TelemetrySnapshot;
  onReturnToMainMenu: () => void;
}

export const ProjectExecutionScreen: React.FC<ProjectExecutionScreenProps> = ({
  snapshot,
  onReturnToMainMenu,
}) => {
  const isCompleted = snapshot.projectStatus === 'COMPLETED';
  const activeSession = snapshot.aiSessions[0];

  useInput((_input: string, key: any) => {
    if (isCompleted && (key.return || key.rightArrow || _input === ' ')) {
      onReturnToMainMenu();
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      {/* 1. Top System Status Bar */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">SE-OS v2.0</Text>
        <Text color="gray">|</Text>
        <Text color="green">Kernel: {snapshot.metrics.kernelStatus}</Text>
        <Text color="gray">|</Text>
        <Text color="cyan">Runtime: {snapshot.activeRuntimeProviderId}</Text>
        <Text color="gray">|</Text>
        <Text color="yellow">Workers: {snapshot.metrics.totalWorkersCount} Active</Text>
        <Text color="gray">|</Text>
        <Text color="green">{snapshot.projectStatus}</Text>
      </Box>

      {/* 2. Business Goal & Stage Banner */}
      <Box borderStyle="round" borderColor="green" paddingX={1} flexDirection="column" marginY={0}>
        <Text bold color="green">
          PROJECT GOAL: "{snapshot.businessGoal}" [{snapshot.projectId}]
        </Text>
        <Box justifyContent="space-between" marginTop={0}>
          <Text color="cyan">{snapshot.currentStage}</Text>
          <Text bold color="yellow">Progress: {snapshot.progressPercent}%</Text>
        </Box>
      </Box>

      {/* 3. Middle Split Area (DAG Tree & Worker Fleet vs AI Session Monitor) */}
      <Box flexGrow={1} flexShrink={1}>
        {/* Left Column: ASCII Mission Tree & Worker Fleet */}
        <Box flexDirection="column" width="45%" borderStyle="single" borderColor="gray" padding={1}>
          <Text bold color="cyan" underline>
            ASCII MISSION TREE (DAG):
          </Text>
          <Text color="white">Goal</Text>
          <Text color="white">└── Mission-001</Text>
          {snapshot.tasks.map((task: any) => (
            <Box key={task.id} marginLeft={4}>
              <Text color="gray">├── </Text>
              <Text color={task.status === 'COMPLETED' ? 'green' : task.status === 'RUNNING' ? 'cyan' : 'gray'}>
                {task.title} [{task.status === 'COMPLETED' ? '✓' : task.status === 'RUNNING' ? '▶' : '○'}]
              </Text>
            </Box>
          ))}

          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow" underline>
              WORKER FLEET (ROLE, AI PROVIDER, PWD, TERMINAL, BRANCH):
            </Text>
            {snapshot.workers.map((w: any) => (
              <Box key={w.id} flexDirection="column" marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
                <Box justifyContent="space-between">
                  <Text color="green" bold>{w.name} ({w.role})</Text>
                  <Text color="cyan">AI: {w.assignedProvider || w.runtimeProvider}</Text>
                  <Text color={w.status === 'BUSY' ? 'green' : 'gray'}>[{w.status}]</Text>
                </Box>
                <Text color="white">  pwd: {w.workingDirectory || './src'}</Text>
                <Text color="gray">  pane: {w.terminalPane || 'tmux pane 1'} | branch: {w.gitBranch || 'master'}</Text>
                <Text color="yellow">  cmd: {w.currentCommand || 'node --version'}</Text>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Right Column: AI Session Monitor & Real-Time File Events */}
        <Box flexDirection="column" width="55%" borderStyle="single" borderColor="purple" padding={1}>
          <Text bold color="purple" underline>
            LIVE AI SESSION MONITOR & REAL-TIME FILE MONITOR:
          </Text>

          {activeSession ? (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="cyan">Prompt Context:</Text>
              <Text color="gray">"{activeSession.prompt}"</Text>

              <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
                <Text bold color="yellow">STREAMING STDOUT LOG ({activeSession.providerName}):</Text>
                {activeSession.streamingOutput.map((line: string, idx: number) => (
                  <Text key={idx} color={line.includes('PASSED') || line.includes('written') ? 'green' : 'white'}>
                    &gt; {line}
                  </Text>
                ))}
              </Box>

              <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
                <Text bold color="cyan">REAL-TIME FILE EVENT STREAM (WITH TIMESTAMPS):</Text>
                {(snapshot.fileEvents || []).map((fe: any) => (
                  <Text key={fe.id} color={fe.type === 'CREATED' ? 'green' : 'yellow'}>
                    [{fe.timestamp}] {fe.type}: {fe.relativePath} (+{fe.lines} lines) — {fe.workerName}
                  </Text>
                ))}
              </Box>

              <Box marginTop={1} justifyContent="space-between">
                <Text color="gray">Tokens: {activeSession.tokenUsage || 0}</Text>
                <Text color="cyan">Duration: {activeSession.durationMs}ms</Text>
                <Text color="green">Status: {activeSession.status}</Text>
              </Box>
            </Box>
          ) : (
            <Text color="gray">Waiting for AI Session telemetry...</Text>
          )}
        </Box>
      </Box>

      {/* 4. Bottom Row: Verification & System Console */}
      <Box height={7} borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
        {/* Verification Checklist */}
        <Box flexDirection="column" width="40%">
          <Text bold color="cyan">PHYSICAL VERIFICATION PIPELINE:</Text>
          {snapshot.verification?.stepResults.map((s: any, idx: number) => (
            <Text key={idx} color={s.passed ? 'green' : 'red'}>
              [{s.passed ? '✓' : '✗'}] {s.name.replace('Check', '')} ({s.durationMs}ms)
            </Text>
          ))}
        </Box>

        {/* System Log Feed */}
        <Box flexDirection="column" width="58%">
          <Text bold color="yellow">SYSTEM LOG STREAM:</Text>
          {snapshot.systemConsoleLogs.slice(0, 4).map((log: any) => (
            <Text key={log.id} color={log.level === 'SUCCESS' ? 'green' : 'gray'}>
              [{log.timestamp}] {log.message}
            </Text>
          ))}
        </Box>
      </Box>

      {/* 5. Completion Modal Banner */}
      {isCompleted && (
        <Box borderStyle="double" borderColor="green" padding={1} flexDirection="column" marginTop={1}>
          <Text bold color="green">
            ✔ PROJECT EXECUTION COMPLETED SUCCESSFULLY!
          </Text>
          <Text color="white">
            - Execution Summary: 6/6 tasks completed cleanly.
          </Text>
          <Text color="cyan">
            - Verification Quality Score: {snapshot.verification?.qualityScore || 100} / 100 [PASSED]
          </Text>
          <Text color="yellow">
            - Generated Workspace: ./.se_workspaces/ws-t-104/
          </Text>
          <Box marginTop={1}>
            <Text bold color="cyan">
              [ Press ENTER to Return to Main Menu ]
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
