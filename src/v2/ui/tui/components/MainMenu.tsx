import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';

interface MainMenuProps {
  onSelectOption: (option: string) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onSelectOption }) => {
  const items = [
    { label: '1. New Project (Autonomous Business Goal Execution)', value: 'NEW_PROJECT' },
    { label: '2. Resume Active Project', value: 'RESUME' },
    { label: '3. Open Workspace Explorer', value: 'WORKSPACE' },
    { label: '4. Settings & Execution Policy', value: 'SETTINGS' },
    { label: '5. Exit SE-OS', value: 'EXIT' },
  ];

  return (
    <Box flexDirection="column" padding={1} borderStyle="single" borderColor="cyan">
      <Text bold color="cyan" underline>
        SE-OS  /  What do you want to do?
      </Text>
      <Text color="gray">You are the project owner. Start with a goal; the team handles the technical plan.</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item: { label: string; value: string }) => onSelectOption(item.value)}
        />
      </Box>
    </Box>
  );
};
