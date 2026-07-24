import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import * as path from 'path';
import * as os from 'os';

interface ProjectWizardProps {
  onStartProject: (projectName: string, absolutePath: string) => void;
}

export const ProjectWizard: React.FC<ProjectWizardProps> = ({ onStartProject }) => {
  const [step, setStep] = useState<'NAME' | 'LOCATION' | 'CUSTOM_PATH' | 'CONFIRM'>('NAME');
  const [projectName, setProjectName] = useState<string>('My REST API');
  const [selectedLocationOption, setSelectedLocationOption] = useState<string>('desktop');
  const [customPathInput, setCustomPathInput] = useState<string>('');
  const [resolvedPath, setResolvedPath] = useState<string>('');

  const handleNameSubmit = (val: string) => {
    const name = val.trim() || 'My REST API';
    setProjectName(name);
    setStep('LOCATION');
  };

  const handleLocationSelect = (item: { label: string; value: string }) => {
    setSelectedLocationOption(item.value);
    const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (item.value === 'desktop') {
      const abs = path.join(os.homedir(), 'Desktop', sanitizedName);
      setResolvedPath(abs);
      setStep('CONFIRM');
    } else if (item.value === 'documents') {
      const abs = path.join(os.homedir(), 'Documents', sanitizedName);
      setResolvedPath(abs);
      setStep('CONFIRM');
    } else if (item.value === 'current') {
      const abs = path.join(process.cwd(), sanitizedName);
      setResolvedPath(abs);
      setStep('CONFIRM');
    } else if (item.value === 'custom') {
      setStep('CUSTOM_PATH');
    }
  };

  const handleCustomPathSubmit = (val: string) => {
    const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const inputPath = val.trim() || process.cwd();
    const abs = path.isAbsolute(inputPath)
      ? path.join(inputPath, sanitizedName)
      : path.resolve(process.cwd(), inputPath, sanitizedName);
    setResolvedPath(abs);
    setStep('CONFIRM');
  };

  const locationItems = [
    { label: `1. Desktop (~/Desktop/${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')})`, value: 'desktop' },
    { label: `2. Documents (~/Documents/${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')})`, value: 'documents' },
    { label: `3. Current Directory (./${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')})`, value: 'current' },
    { label: `4. Custom Path...`, value: 'custom' },
  ];

  const confirmItems = [
    { label: `[✓] Confirm & Start Project Execution`, value: 'confirm' },
    { label: `[←] Change Settings`, value: 'back' },
  ];

  return (
    <Box flexDirection="column" padding={1} borderStyle="double" borderColor="cyan" width="100%">
      <Text bold color="cyan">
        ════════════════════════════════════════════════════════════════════════
        SE-OS v2.0 — AUTONOMOUS PROJECT CREATION WIZARD
        ════════════════════════════════════════════════════════════════════════
      </Text>

      {step === 'NAME' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">
            STEP 1: Enter Project Name:
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">&gt; </Text>
            <TextInput value={projectName} onChange={setProjectName} onSubmit={handleNameSubmit} />
          </Box>
          <Box marginTop={1}>
            <Text color="gray">[ Press ENTER to Continue ]</Text>
          </Box>
        </Box>
      )}

      {step === 'LOCATION' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">
            STEP 2: Select Workspace Target Directory for "{projectName}":
          </Text>
          <Box marginTop={1}>
            <SelectInput items={locationItems} onSelect={handleLocationSelect} />
          </Box>
        </Box>
      )}

      {step === 'CUSTOM_PATH' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">
            STEP 2b: Enter Custom Absolute Path for Workspace:
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">&gt; </Text>
            <TextInput value={customPathInput} onChange={setCustomPathInput} onSubmit={handleCustomPathSubmit} />
          </Box>
          <Box marginTop={1}>
            <Text color="gray">[ Press ENTER to Confirm Custom Path ]</Text>
          </Box>
        </Box>
      )}

      {step === 'CONFIRM' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">
            STEP 3: Explicit Path Confirmation:
          </Text>
          <Box borderStyle="single" borderColor="yellow" padding={1} marginTop={1} flexDirection="column">
            <Text color="white">Project Name: <Text bold color="cyan">{projectName}</Text></Text>
            <Text color="white">Resolved Absolute Path: <Text bold color="yellow">{resolvedPath}</Text></Text>
            <Box marginTop={1}>
              <Text color="gray">* SE-OS will generate physical files in this directory. No hidden workspaces.</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <SelectInput
              items={confirmItems}
              onSelect={(item: { label: string; value: string }) => {
                if (item.value === 'confirm') {
                  onStartProject(projectName, resolvedPath);
                } else {
                  setStep('NAME');
                }
              }}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
};
