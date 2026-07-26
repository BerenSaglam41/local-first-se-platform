import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { ProjectExecutionResult } from '../../../contracts/iproject_lifecycle_orchestrator';

interface ProjectSelectorProps {
  projects: ProjectExecutionResult[];
  onSelect: (projectId: string) => void;
  onBack: () => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({ projects, onSelect, onBack }) => {
  const items = [
    ...projects.map((project) => ({
      label: `${project.state.projectId} · ${project.state.goal} · ${project.state.status}`,
      value: project.state.projectId,
    })),
    { label: '← Back', value: '__BACK__' },
  ];

  return (
    <Box flexDirection="column" padding={1} borderStyle="single" borderColor="cyan">
      <Text bold color="cyan">SELECT PROJECT TO CONTINUE</Text>
      <Text color="gray">Choose which project receives your next command.</Text>
      {items.length === 1 ? <Text color="yellow">No saved projects yet. Start a new project first.</Text> : <SelectInput items={items} onSelect={(item: { value: string }) => item.value === '__BACK__' ? onBack() : onSelect(item.value)} />}
    </Box>
  );
};
