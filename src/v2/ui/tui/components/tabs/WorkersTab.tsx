import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';
import { Kernel } from '../../../../kernel/kernel';

interface WorkersTabProps {
  snapshot: TelemetrySnapshot;
  kernel?: Kernel;
}

export const WorkersTab: React.FC<WorkersTabProps> = ({ snapshot, kernel }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionStatus, setActionStatus] = useState<string>('');

  const workers = snapshot.workers;
  const selectedWorker = workers[selectedIndex] || workers[0];

  useInput((input: string, key: any) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : workers.length - 1));
      setActionStatus('');
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < workers.length - 1 ? prev + 1 : 0));
      setActionStatus('');
      return;
    }
    if (!selectedWorker || !kernel) return;

    const char = input.toLowerCase();
    if (char === 'i') {
      kernel.getReasoningCoordinator().cancelForWorker(selectedWorker.id).then((cancelled: boolean) => {
        setActionStatus(cancelled ? `Interrupted ${selectedWorker.name}.` : `${selectedWorker.name} had nothing in-flight.`);
      });
    } else if (char === 'r') {
      const res = kernel.getSupervisor().restartWorker(selectedWorker.id);
      setActionStatus(res ? `Restarted ${selectedWorker.name} (new PID ${res.process.pid}).` : `Failed to restart ${selectedWorker.name}.`);
    } else if (char === 'p') {
      const ok = kernel.getSupervisor().pauseWorker(selectedWorker.id);
      setActionStatus(ok ? `Paused ${selectedWorker.name}.` : `Failed to pause ${selectedWorker.name}.`);
    } else if (char === 'u') {
      const ok = kernel.getSupervisor().resumeWorker(selectedWorker.id);
      setActionStatus(ok ? `Resumed ${selectedWorker.name}.` : `Failed to resume ${selectedWorker.name}.`);
    }
  });

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Text bold color="yellow" underline>
        AI WORKER FLEET TEAM (↑/↓ select · I interrupt · R restart · P pause · U resume):
      </Text>

      <Box marginTop={1} gap={1}>
        {/* Left Column: Worker Team List */}
        <Box flexDirection="column" width="40%" borderStyle="single" borderColor="cyan" padding={1}>
          {workers.map((w, idx) => (
            <Box key={w.id} justifyContent="space-between">
              <Text color={idx === selectedIndex ? 'green' : 'white'} bold={idx === selectedIndex}>
                {idx === selectedIndex ? '❯ ' : '  '}{w.name} ({w.role})
              </Text>
              <Text color="cyan">[{w.assignedProvider}]</Text>
            </Box>
          ))}
        </Box>

        {/* Right Column: Detailed Worker Inspector */}
        {selectedWorker && (
          <Box flexDirection="column" width="60%" borderStyle="single" borderColor="green" padding={1}>
            <Text bold color="green" underline>WORKER INSPECTOR: {selectedWorker.name}</Text>
            <Text color="white">Role: <Text bold color="cyan">{selectedWorker.role}</Text></Text>
            <Text color="white">Assigned AI Provider: <Text bold color="yellow">{selectedWorker.assignedProvider}</Text></Text>
            <Text color="white">Status: <Text color={selectedWorker.status === 'EXECUTING' || selectedWorker.status === 'REASONING' ? 'green' : 'gray'}>[{selectedWorker.status}]</Text></Text>
            <Text color="white">Working Directory (pwd): <Text bold color="cyan">{selectedWorker.workingDirectory || '(idle — no active workspace)'}</Text></Text>
            <Text color="white">Process: <Text color="gray">{selectedWorker.terminalPane}</Text></Text>
            <Text color="white">Git Branch: <Text color="gray">{selectedWorker.gitBranch}</Text></Text>
            <Text color="white">Current Command: <Text bold color="yellow">{selectedWorker.currentCommand}</Text></Text>
            <Text color="white">Current File: <Text bold color="cyan">{selectedWorker.currentFile || '(none)'}</Text></Text>
            <Text color="white">Current Task: <Text color="white">{selectedWorker.currentTaskTitle || '(idle)'}</Text></Text>
            <Text color="white">Elapsed Duration: <Text color="cyan">{selectedWorker.durationMs}ms</Text></Text>
            {actionStatus ? <Text color="magenta">→ {actionStatus}</Text> : null}
          </Box>
        )}
      </Box>
    </Box>
  );
};
