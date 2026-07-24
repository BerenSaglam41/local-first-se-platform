import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { TelemetryAggregator } from '../../application/telemetry/telemetry_aggregator';
import { TelemetrySnapshot } from '../../contracts/itelemetry_aggregator';
import { ScreenManager, TuiScreenType } from './managers/screen_manager';
import { StartupScreen } from './components/StartupScreen';
import { RuntimeSelector } from './components/RuntimeSelector';
import { MainMenu } from './components/MainMenu';
import { NewProjectPrompt } from './components/NewProjectPrompt';

interface TuiAppProps {
  telemetryAggregator: TelemetryAggregator;
  onExit?: () => void;
}

export const TuiApp: React.FC<TuiAppProps> = ({ telemetryAggregator, onExit }) => {
  const { exit } = useApp();
  const [screenManager] = useState(() => new ScreenManager());
  const [currentScreen, setCurrentScreen] = useState<TuiScreenType>('STARTUP');
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() => telemetryAggregator.getSnapshot());

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(telemetryAggregator.getSnapshot());
    }, 500);
    return () => clearInterval(timer);
  }, [telemetryAggregator]);

  useInput((input: string, key: any) => {
    if (input === 'q' && currentScreen !== 'NEW_PROJECT_PROMPT') {
      if (onExit) onExit();
      exit();
    }
  });

  const navigate = (screen: TuiScreenType) => {
    screenManager.navigateTo(screen);
    setCurrentScreen(screen);
  };

  return (
    <Box flexDirection="column" width="100%">
      {currentScreen === 'STARTUP' && (
        <StartupScreen
          snapshot={snapshot}
          onContinue={() => navigate('RUNTIME_SELECTION')}
        />
      )}

      {currentScreen === 'RUNTIME_SELECTION' && (
        <RuntimeSelector
          snapshot={snapshot}
          onSelectRuntime={(providerId) => {
            telemetryAggregator.setActiveRuntimeProvider(providerId);
            navigate('MAIN_MENU');
          }}
        />
      )}

      {currentScreen === 'MAIN_MENU' && (
        <MainMenu
          onSelectOption={(option) => {
            if (option === 'NEW_PROJECT') {
              navigate('NEW_PROJECT_PROMPT');
            } else if (option === 'RESUME' || option === 'WORKSPACE') {
              navigate('PROJECT_EXECUTION');
            } else if (option === 'EXIT') {
              if (onExit) onExit();
              exit();
            }
          }}
        />
      )}

      {currentScreen === 'NEW_PROJECT_PROMPT' && (
        <NewProjectPrompt
          onSubmitGoal={(goal) => {
            telemetryAggregator.logMessage('INFO', `Starting project goal: '${goal}'`);
            navigate('PROJECT_EXECUTION');
          }}
        />
      )}

      {currentScreen === 'PROJECT_EXECUTION' && (
        <Box flexDirection="column" padding={1} borderStyle="single" borderColor="green">
          <Text bold color="green">
            [ PROJECT EXECUTION MODE ]
          </Text>
          <Text color="cyan">Goal: {snapshot.businessGoal}</Text>
          <Text color="yellow">Status: {snapshot.projectStatus} ({snapshot.progressPercent}%)</Text>
          <Box marginTop={1}>
            <Text color="gray">[ Press 'q' to Exit TUI ]</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
