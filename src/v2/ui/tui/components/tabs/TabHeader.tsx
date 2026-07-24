import React from 'react';
import { Box, Text } from 'ink';

export type SeOsTabType = 'DASHBOARD' | 'WORKERS' | 'WORKSPACE' | 'TERMINALS' | 'CHAT' | 'VERIFICATION' | 'LOGS';

interface TabHeaderProps {
  activeTab: SeOsTabType;
  onSelectTab: (tab: SeOsTabType) => void;
}

export const TabHeader: React.FC<TabHeaderProps> = ({ activeTab }) => {
  const tabs: Array<{ id: SeOsTabType; keyLabel: string; title: string }> = [
    { id: 'DASHBOARD', keyLabel: '1', title: 'Dashboard' },
    { id: 'WORKERS', keyLabel: '2', title: 'Workers' },
    { id: 'WORKSPACE', keyLabel: '3', title: 'Workspace' },
    { id: 'TERMINALS', keyLabel: '4', title: 'Terminals' },
    { id: 'CHAT', keyLabel: '5', title: 'Chat' },
    { id: 'VERIFICATION', keyLabel: '6', title: 'Verification' },
    { id: 'LOGS', keyLabel: '7', title: 'Logs' },
  ];

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text bold color="green">SE-OS v2.0</Text>
        <Text color="gray">|</Text>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Text
              key={tab.id}
              color={isActive ? 'black' : 'cyan'}
              backgroundColor={isActive ? 'cyan' : undefined}
              bold={isActive}
            >
              [{tab.keyLabel}] {tab.title}
            </Text>
          );
        })}
      </Box>
      <Text color="gray">[Press 1-7 or Tab to Switch Views | Press Q to Exit]</Text>
    </Box>
  );
};
