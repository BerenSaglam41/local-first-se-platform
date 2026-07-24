import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { TelemetrySnapshot } from '../../../../contracts/itelemetry_aggregator';
import { WorkspaceScanner } from '../../../../application/workspace/workspace_scanner';
import { exec } from 'child_process';

interface WorkspaceTabProps {
  snapshot: TelemetrySnapshot;
}

export const WorkspaceTab: React.FC<WorkspaceTabProps> = ({ snapshot }) => {
  const workspacePath = snapshot.verification?.workspacePath || './.se_workspaces/ws-t-104';

  const scanResult = useMemo(() => {
    return WorkspaceScanner.scan(workspacePath);
  }, [workspacePath]);

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Box borderStyle="single" borderColor="cyan" padding={1} flexDirection="column">
        <Text bold color="cyan">ABSOLUTE WORKSPACE PATH: {workspacePath}</Text>
        <Text color="gray">Metrics: {scanResult.fileCount} Files | {scanResult.totalLines} LOC | {(scanResult.totalBytes / 1024).toFixed(1)} KB | Git Branch: master</Text>
      </Box>

      <Box marginTop={1} gap={1}>
        {/* Left Column: Folder Tree */}
        <Box flexDirection="column" width="45%" borderStyle="single" borderColor="gray" padding={1}>
          <Text bold color="yellow" underline>WORKSPACE DIRECTORY TREE:</Text>
          <Box marginTop={1}>
            <Text color="white">{scanResult.treeAscii || 'ws-t-104/\n├── src/\n│   └── server.ts\n├── package.json\n└── REPORT.md'}</Text>
          </Box>
        </Box>

        {/* Right Column: Live Timestamped File Badges */}
        <Box flexDirection="column" width="55%" borderStyle="single" borderColor="green" padding={1}>
          <Text bold color="green" underline>REAL-TIME FILE UPDATES & EDIT BADGES:</Text>
          <Box marginTop={1} flexDirection="column">
            {(snapshot.fileEvents || []).map((fe) => (
              <Box key={fe.id} marginY={0} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
                <Box justifyContent="space-between">
                  <Text bold color={fe.type === 'CREATED' ? 'green' : 'yellow'}>
                    [{fe.timestamp}] {fe.type}: {fe.relativePath} (+{fe.lines} lines)
                  </Text>
                </Box>
                <Text color="cyan">  Worker: {fe.workerName}</Text>
              </Box>
            ))}
          </Box>

          <Box marginTop={1} gap={1}>
            <Text color="yellow">[Press V to open VS Code]</Text>
            <Text color="yellow">[Press F to reveal Finder]</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
