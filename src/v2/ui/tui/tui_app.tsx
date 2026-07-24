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
import { TabHeader, SeOsTabType } from './components/tabs/TabHeader.js';
import { DashboardTab } from './components/tabs/DashboardTab.js';
import { WorkersTab } from './components/tabs/WorkersTab.js';
import { WorkspaceTab } from './components/tabs/WorkspaceTab.js';
import { TerminalsTab } from './components/tabs/TerminalsTab.js';
import { ChatTab } from './components/tabs/ChatTab.js';
import { VerificationTab } from './components/tabs/VerificationTab.js';
import { LogsTab } from './components/tabs/LogsTab.js';
import { ProjectWizard } from './components/ProjectWizard.js';
import { Kernel } from '../../kernel/kernel.js';
import { exec } from 'child_process';

interface TuiAppProps {
  telemetryAggregator: TelemetryAggregator;
  kernel?: Kernel;
  onExit?: () => void;
}

export const TuiApp: React.FC<TuiAppProps> = ({ telemetryAggregator, kernel, onExit }) => {
  const { exit } = useApp();
  const [screenManager] = useState(() => new ScreenManager());
  const [currentScreen, setCurrentScreen] = useState<TuiScreenType>('STARTUP');
  const [activeTab, setActiveTab] = useState<SeOsTabType>('DASHBOARD');
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() => telemetryAggregator.getSnapshot());
  // The project this conversation is about. Set once by the first runProject() call and reused
  // by every subsequent chat turn via continueProject() — this is what makes the chat an ongoing
  // conversation against one real workspace instead of a fresh project per message.
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(telemetryAggregator.getSnapshot());
    }, 500);
    return () => clearInterval(timer);
  }, [telemetryAggregator]);

  useInput((input: string, key: any) => {
    const char = input.toLowerCase();

    if (currentScreen === 'PROJECT_EXECUTION' && activeTab !== 'CHAT') {
      if (char === '1') setActiveTab('DASHBOARD');
      else if (char === '2') setActiveTab('WORKERS');
      else if (char === '3') setActiveTab('WORKSPACE');
      else if (char === '4') setActiveTab('TERMINALS');
      else if (char === '5') setActiveTab('CHAT');
      else if (char === '6') setActiveTab('VERIFICATION');
      else if (char === '7') setActiveTab('LOGS');
      else if (key.tab) {
        const order: SeOsTabType[] = ['DASHBOARD', 'WORKERS', 'WORKSPACE', 'TERMINALS', 'CHAT', 'VERIFICATION', 'LOGS'];
        const idx = order.indexOf(activeTab);
        setActiveTab(order[(idx + 1) % order.length]);
      } else if (char === 'v') {
        const wsPath = snapshot.verification?.workspacePath || './.se_workspaces/ws-t-104';
        exec(`code "${wsPath}"`, () => {});
      } else if (char === 'f') {
        const wsPath = snapshot.verification?.workspacePath || './.se_workspaces/ws-t-104';
        const cmd = process.platform === 'darwin' ? `open "${wsPath}"` : `explorer "${wsPath}"`;
        exec(cmd, () => {});
      }
    }

    if (char === 'q' && currentScreen !== 'NEW_PROJECT_PROMPT' && activeTab !== 'CHAT') {
      if (onExit) onExit();
      exit();
    }
  });

  const navigate = (screen: TuiScreenType) => {
    screenManager.navigateTo(screen);
    setCurrentScreen(screen);
  };

  const handleChatGoal = async (chatPrompt: string): Promise<{ success: boolean; summary: string }> => {
    telemetryAggregator.logMessage('INFO', `Chat request received: "${chatPrompt}"`);
    if (!kernel) {
      return { success: false, summary: 'Kernel not available.' };
    }

    try {
      const orchestrator = kernel.getProjectLifecycleOrchestrator();
      const result = activeProjectId
        ? await orchestrator.continueProject(activeProjectId, chatPrompt)
        : await orchestrator.runProject(chatPrompt);

      if (!activeProjectId) setActiveProjectId(result.state.projectId);
      telemetryAggregator.logMessage(
        result.success ? 'SUCCESS' : 'ERROR',
        result.success ? `Continued project for "${chatPrompt}"` : `Chat execution failed: ${result.error || result.summary}`
      );
      return { success: result.success, summary: result.summary };
    } catch (err: any) {
      telemetryAggregator.logMessage('ERROR', `Chat execution error: ${err.message}`);
      return { success: false, summary: `Error: ${err.message}` };
    }
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
        <ProjectWizard
          onStartProject={(projectName: string, absolutePath: string) => {
            const goal = `Create ${projectName}`;
            telemetryAggregator.logMessage('INFO', `Triggering autonomous project execution at ${absolutePath}`);
            if (kernel) {
              kernel.getProjectLifecycleOrchestrator().runProject(goal, { absolutePath }).then((result) => {
                setActiveProjectId(result.state.projectId);
                telemetryAggregator.logMessage('SUCCESS', `Autonomous execution completed at ${absolutePath}`);
              }).catch((err: any) => {
                telemetryAggregator.logMessage('ERROR', `Execution error: ${err.message}`);
              });
            }
            navigate('PROJECT_EXECUTION');
          }}
        />
      )}

      {currentScreen === 'PROJECT_EXECUTION' && (
        <Box flexDirection="column" width="100%">
          <TabHeader activeTab={activeTab} onSelectTab={setActiveTab} />
          {activeTab === 'DASHBOARD' && <DashboardTab snapshot={snapshot} />}
          {activeTab === 'WORKERS' && <WorkersTab snapshot={snapshot} kernel={kernel} />}
          {activeTab === 'WORKSPACE' && <WorkspaceTab snapshot={snapshot} />}
          {activeTab === 'TERMINALS' && <TerminalsTab snapshot={snapshot} />}
          {activeTab === 'CHAT' && <ChatTab snapshot={snapshot} onSubmitChatGoal={handleChatGoal} />}
          {activeTab === 'VERIFICATION' && <VerificationTab snapshot={snapshot} />}
          {activeTab === 'LOGS' && <LogsTab snapshot={snapshot} />}
        </Box>
      )}
    </Box>
  );
};
