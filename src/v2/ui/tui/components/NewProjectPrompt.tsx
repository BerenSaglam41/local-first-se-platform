import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface NewProjectPromptProps {
  onSubmitGoal: (goal: string) => void;
}

export const NewProjectPrompt: React.FC<NewProjectPromptProps> = ({ onSubmitGoal }) => {
  const [goal, setGoal] = useState('Create a REST API for User Management');

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="green">
      <Text bold color="green">
        Enter High-Level Business Goal:
      </Text>
      <Box marginTop={1}>
        <Text color="cyan">Business Goal &gt; </Text>
        <TextInput
          value={goal}
          onChange={setGoal}
          onSubmit={(val: string) => onSubmitGoal(val || 'Create a REST API for User Management')}
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray" italic>
          (Press ENTER to start autonomous project lifecycle)
        </Text>
      </Box>
    </Box>
  );
};
