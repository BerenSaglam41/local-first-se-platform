import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';

interface WorkersTabProps {
  snapshot: TelemetrySnapshot;
}

export const WorkersTab: React.FC<WorkersTabProps> = ({ snapshot }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const workers = snapshot.workers;
  const selectedWorker = workers[selectedIndex] || workers[0];

  useInput((_input: string, key: any) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : workers.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < workers.length - 1 ? prev + 1 : 0));
    }
  });

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Text bold color="yellow" underline>
        AI WORKER FLEET TEAM (Use UP/DOWN Arrows to Select & Inspect Worker):
      </Text>

      <Box marginTop={1} gap={1}>
        {/* Left Column: Worker Team List */}
        <Box flexDirection="column" width="40%" borderStyle="single" borderColor="cyan" padding={1}>
          {workers.map((w, idx) => (
            <Box key={w.id} justifyContent="space-between">
              <Text color={idx === selectedIndex ? 'green' : 'white'} bold={idx === selectedIndex}>
                {idx === selectedIndex ? '❯ ' : '  '}{w.name} ({w.role})
              </Text>
              <Text color="cyan">[{w.assignedProvider || w.runtimeProvider}]</Text>
            </Box>
          ))}
        </Box>

        {/* Right Column: Detailed Worker Inspector */}
        {selectedWorker && (
          <Box flexDirection="column" width="60%" borderStyle="single" borderColor="green" padding={1}>
            <Text bold color="green" underline>WORKER INSPECTOR: {selectedWorker.name}</Text>
            <Text color="white">Role: <Text bold color="cyan">{selectedWorker.role}</Text></Text>
            <Text color="white">Assigned AI Provider: <Text bold color="yellow">{selectedWorker.assignedProvider || selectedWorker.runtimeProvider}</Text></Text>
            <Text color="white">Status: <Text color={selectedWorker.status === 'EXECUTING' ? 'green' : 'gray'}>[{selectedWorker.status}]</Text></Text>
            <Text color="white">Working Directory (pwd): <Text bold color="cyan">{selectedWorker.workingDirectory || './src'}</Text></Text>
            <Text color="white">Terminal Pane: <Text color="gray">{selectedWorker.terminalPane || 'tmux pane 1'}</Text></Text>
            <Text color="white">Git Branch: <Text color="gray">{selectedWorker.gitBranch || 'master'}</Text></Text>
            <Text color="white">Current Command: <Text bold color="yellow">{selectedWorker.currentCommand || 'node --version'}</Text></Text>
            <Text color="white">Current File: <Text bold color="cyan">{selectedWorker.currentFile || 'src/server.ts'}</Text></Text>
            <Text color="white">Current Task: <Text color="white">{selectedWorker.currentTaskTitle || 'Design Architecture'}</Text></Text>
            <Text color="white">Elapsed Duration: <Text color="cyan">{selectedWorker.durationMs}ms</Text></Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
