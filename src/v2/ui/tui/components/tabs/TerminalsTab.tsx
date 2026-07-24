import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';

interface TerminalsTabProps {
  snapshot: TelemetrySnapshot;
}

export const TerminalsTab: React.FC<TerminalsTabProps> = ({ snapshot }) => {
  const [selectedWorkerIndex, setSelectedWorkerIndex] = useState(1); // Default to Bob

  const workers = snapshot.workers;
  const currentWorker = workers[selectedWorkerIndex] || workers[0];
  const activeSession = snapshot.aiSessions[0];

  useInput((_input: string, key: any) => {
    if (key.leftArrow || key.upArrow) {
      setSelectedWorkerIndex((prev) => (prev > 0 ? prev - 1 : workers.length - 1));
    } else if (key.rightArrow || key.downArrow) {
      setSelectedWorkerIndex((prev) => (prev < workers.length - 1 ? prev + 1 : 0));
    }
  });

  return (
    <Box flexDirection="column" padding={1} width="100%">
      {/* Worker Selector Bar */}
      <Box borderStyle="single" borderColor="yellow" paddingX={1} gap={2}>
        <Text bold color="yellow">SELECT WORKER TERMINAL:</Text>
        {workers.map((w, idx) => {
          const isSelected = idx === selectedWorkerIndex;
          return (
            <Text
              key={w.id}
              color={isSelected ? 'black' : 'cyan'}
              backgroundColor={isSelected ? 'yellow' : undefined}
              bold={isSelected}
            >
              [{idx + 1}] {w.name} ({w.assignedProvider || w.runtimeProvider})
            </Text>
          );
        })}
      </Box>

      {/* Live Terminal View Container */}
      {currentWorker && (
        <Box marginTop={1} flexDirection="column" borderStyle="double" borderColor="green" padding={1}>
          <Box justifyContent="space-between">
            <Text bold color="green">
              TERMINAL PANE: {currentWorker.name} ({currentWorker.role}) — {currentWorker.assignedProvider || currentWorker.runtimeProvider}
            </Text>
            <Text color="gray">{currentWorker.terminalPane || 'tmux pane 2 (PID 48840)'}</Text>
          </Box>

          <Box marginY={0}>
            <Text color="cyan">PWD: {currentWorker.workingDirectory || './src'} | Branch: {currentWorker.gitBranch || 'master'} | Command: {currentWorker.currentCommand || 'codex exec'}</Text>
          </Box>

          {/* Streaming Output Box */}
          <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
            <Text bold color="yellow">STREAMING TERMINAL STDOUT / STDERR LOG:</Text>
            <Text color="gray">&gt; [PtyTransport] Connected worker session {currentWorker.id} (PID 48840)</Text>
            <Text color="gray">&gt; [RuntimePlugin] Working directory: {currentWorker.workingDirectory || './src'}</Text>
            <Text color="white">&gt; [RuntimePlugin] Executing: {currentWorker.currentCommand || 'codex exec'}</Text>
            {activeSession?.streamingOutput.map((line, idx) => (
              <Text key={idx} color={line.includes('PASSED') || line.includes('written') ? 'green' : 'white'}>
                &gt; {line}
              </Text>
            ))}
            <Text color="green">&gt; [Process] Execution active (0 exit code)</Text>
          </Box>

          <Box marginTop={1} justifyContent="space-between">
            <Text color="gray">Status: {currentWorker.status}</Text>
            <Text color="cyan">Elapsed: {currentWorker.durationMs}ms</Text>
            <Text color="yellow">Tokens: 1,420</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
