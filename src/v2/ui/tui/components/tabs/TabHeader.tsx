import React from 'react';
import { Box, Text } from 'ink';

export type SeOsTabType = 'DASHBOARD' | 'WORKERS' | 'WORKSPACE' | 'TERMINALS' | 'CHAT' | 'VERIFICATION' | 'LOGS';

interface TabHeaderProps {
  activeTab: SeOsTabType;
  onSelectTab: (tab: SeOsTabType) => void;
}

export const TabHeader: React.FC<TabHeaderProps> = ({ activeTab }) => {
  const tabs: Array<{ id: SeOsTabType; keyLabel: string; title: string }> = [
    { id: 'DASHBOARD', keyLabel: '1', title: 'Overview' },
    { id: 'WORKERS', keyLabel: '2', title: 'Team' },
    { id: 'WORKSPACE', keyLabel: '3', title: 'Workspace' },
    { id: 'TERMINALS', keyLabel: '4', title: 'Terminals' },
    { id: 'CHAT', keyLabel: '5', title: 'Command' },
    { id: 'VERIFICATION', keyLabel: '6', title: 'Checks' },
    { id: 'LOGS', keyLabel: '7', title: 'Logs' },
  ];

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="green">SE-OS  /  YOUR ENGINEERING TEAM</Text>
        <Text color="gray">Esc: overview  ·  Q: quit</Text>
      </Box>
      <Box gap={1} marginTop={1}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Text
              key={tab.id}
              color={isActive ? 'black' : 'cyan'}
              backgroundColor={isActive ? 'cyan' : undefined}
              bold={isActive}
            >
              {tab.keyLabel} {tab.title}
            </Text>
          );
        })}
      </Box>
      <Text color="gray">Press 1–7 to switch  ·  Tab for next screen  ·  selected screen is highlighted</Text>
    </Box>
  );
};
