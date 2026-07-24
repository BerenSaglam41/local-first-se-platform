import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { TelemetryAggregator } from '../../application/telemetry/telemetry_aggregator.js';
import { TelemetrySnapshot } from '../../contracts/itelemetry_aggregator.js';
import { ScreenManager, TuiScreenType } from './managers/screen_manager.js';
import { StartupScreen } from './components/StartupScreen.js';
import { RuntimeSelector } from './components/RuntimeSelector.js';
import { MainMenu } from './components/MainMenu.js';
import { NewProjectPrompt } from './components/NewProjectPrompt.js';
import { ProjectExecutionScreen } from './components/ProjectExecutionScreen.js';
import { ProjectCompletionScreen } from './components/ProjectCompletionScreen.js';
import { Kernel } from '../../kernel/kernel.js';

interface TuiAppProps {
  telemetryAggregator: TelemetryAggregator;
  kernel?: Kernel;
  onExit?: () => void;
}

export const TuiApp: React.FC<TuiAppProps> = ({ telemetryAggregator, kernel, onExit }) => {
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
          onSelectRuntime={(providerId: string) => {
            telemetryAggregator.setActiveRuntimeProvider(providerId);
            navigate('MAIN_MENU');
          }}
        />
      )}

      {currentScreen === 'MAIN_MENU' && (
        <MainMenu
          onSelectOption={(option: string) => {
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
          onSubmitGoal={(goal: string) => {
            telemetryAggregator.logMessage('INFO', `Triggering autonomous project goal: '${goal}'`);
            if (kernel) {
              kernel.getProjectLifecycleOrchestrator().runProject(goal).then(() => {
                telemetryAggregator.logMessage('SUCCESS', `Autonomous execution completed for '${goal}'`);
              }).catch((err: any) => {
                telemetryAggregator.logMessage('ERROR', `Execution error: ${err.message}`);
              });
            }
            navigate('PROJECT_EXECUTION');
          }}
        />
      )}

      {currentScreen === 'PROJECT_EXECUTION' && (
        snapshot.projectStatus === 'COMPLETED' ? (
          <ProjectCompletionScreen
            snapshot={snapshot}
            onNewProject={() => navigate('NEW_PROJECT_PROMPT')}
            onExit={() => {
              if (onExit) onExit();
              exit();
            }}
          />
        ) : (
          <ProjectExecutionScreen
            snapshot={snapshot}
            onReturnToMainMenu={() => navigate('MAIN_MENU')}
          />
        )
      )}
    </Box>
  );
};
