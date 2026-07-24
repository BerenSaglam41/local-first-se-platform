import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';

interface TerminalsTabProps {
  snapshot: TelemetrySnapshot;
}

export const TerminalsTab: React.FC<TerminalsTabProps> = ({ snapshot }) => {
  const [selectedWorkerIndex, setSelectedWorkerIndex] = useState(0);

  const workers = snapshot.workers;
  const currentWorker = workers[selectedWorkerIndex] || workers[0];
  // Real session for the SELECTED worker, not a hardcoded first entry — a session only exists
  // once that specific worker has actually run something.
  const activeSession = currentWorker ? snapshot.aiSessions.find((s) => s.workerId === currentWorker.id) : undefined;

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
              [{idx + 1}] {w.name} ({w.assignedProvider})
            </Text>
          );
        })}
      </Box>

      {/* Live Terminal View Container */}
      {currentWorker && (
        <Box marginTop={1} flexDirection="column" borderStyle="double" borderColor="green" padding={1}>
          <Box justifyContent="space-between">
            <Text bold color="green">
              TERMINAL: {currentWorker.name} ({currentWorker.role}) — {currentWorker.assignedProvider}
            </Text>
            <Text color="gray">{currentWorker.terminalPane}</Text>
          </Box>

          <Box marginY={0}>
            <Text color="cyan">PWD: {currentWorker.workingDirectory || '(idle)'} | Branch: {currentWorker.gitBranch} | Command: {currentWorker.currentCommand}</Text>
          </Box>

          {/* Streaming Output Box — real per-worker terminal log tail, or an honest empty state */}
          <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
            <Text bold color="yellow">REAL TERMINAL LOG (tail):</Text>
            {activeSession && activeSession.streamingOutput.length > 0 ? (
              activeSession.streamingOutput.map((line, idx) => (
                <Text key={idx} color={line.startsWith('[exit 0]') ? 'green' : line.startsWith('[exit') ? 'red' : 'white'}>
                  &gt; {line}
                </Text>
              ))
            ) : (
              <Text color="gray">(no output yet — this worker hasn't run a task in this session)</Text>
            )}
          </Box>

          <Box marginTop={1} justifyContent="space-between">
            <Text color="gray">Status: {currentWorker.status}</Text>
            <Text color="cyan">Elapsed: {currentWorker.durationMs}ms</Text>
            <Text color="yellow">Tokens: {activeSession?.tokenUsage ?? 0}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
