import React, { useState } from 'react';
import { SeOsApiService } from './services/se_os_api';
import { DashboardWorker, DashboardTaskNode } from './types/dashboard';
import { TopSystemBar } from './components/TopSystemBar';
import { PrimaryProjectHeader } from './components/PrimaryProjectHeader';
import { MissionDagGraph } from './components/MissionDagGraph';
import { WorkerFleetPanel } from './components/WorkerFleetPanel';
import { AiSessionTerminal } from './components/AiSessionTerminal';
import { LiveEventStream } from './components/LiveEventStream';
import { WorkspaceChangesPanel } from './components/WorkspaceChangesPanel';
import { VerificationChecklistPanel } from './components/VerificationChecklistPanel';
import { SystemConsoleTerminal } from './components/SystemConsoleTerminal';

export const App: React.FC = () => {
  const [state] = useState(() => SeOsApiService.fetchDashboardState());
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('emp-bob');
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>('t-104');

  const selectedWorker = state.workers.find((w) => w.id === selectedWorkerId) || state.workers[0];
  const selectedAiSession = state.aiSessions.find((s) => s.workerId === selectedWorkerId) || state.aiSessions[0];

  const handleSelectWorker = (worker: DashboardWorker) => {
    setSelectedWorkerId(worker.id);
  };

  const handleSelectTask = (task: DashboardTaskNode) => {
    setSelectedTaskId(task.id);
    if (task.assignedWorkerId) {
      setSelectedWorkerId(task.assignedWorkerId);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#080a0f] text-slate-100 selection:bg-cyan-500/30 overflow-hidden">
      {/* 1. TOP SYSTEM BAR (Overall System Health) */}
      <TopSystemBar
        kernelStatus={state.systemHealth.kernelStatus}
        runtimeProvider={state.systemHealth.runtimeProvider}
        totalWorkersCount={state.systemHealth.totalWorkersCount}
        runningTasksCount={state.systemHealth.runningTasksCount}
        queuedTasksCount={state.systemHealth.queuedTasksCount}
        memoryUsageMB={state.systemHealth.memoryUsageMB}
        cpuLoadPercent={state.systemHealth.cpuLoadPercent}
      />

      {/* Main Single-Screen Dashboard Layout */}
      <main className="flex-1 p-3 flex flex-col gap-3 h-[calc(100vh-36px)] overflow-hidden">
        {/* 2. PRIMARY FOCAL AREA (Business Goal & Project Status - Eye sees this first) */}
        <PrimaryProjectHeader
          projectId={state.projectId}
          businessGoal={state.businessGoal}
          projectStatus={state.projectStatus}
          currentStage={state.currentStage}
          estimatedCompletionMinutes={state.estimatedCompletionMinutes}
          progressPercent={state.progressPercent}
        />

        {/* 3. SECONDARY AREA (4 Equal Panels) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-1 min-h-[340px]">
          {/* Panel 1: Mission Graph (DAG) */}
          <div className="h-full">
            <MissionDagGraph
              tasks={state.tasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
            />
          </div>

          {/* Panel 2: Worker Fleet */}
          <div className="h-full">
            <WorkerFleetPanel
              workers={state.workers}
              selectedWorkerId={selectedWorkerId}
              onSelectWorker={handleSelectWorker}
            />
          </div>

          {/* Panel 3: AI Session (Cursor AI style for selected worker) */}
          <div className="h-full">
            <AiSessionTerminal session={selectedAiSession} />
          </div>

          {/* Panel 4: Live Events */}
          <div className="h-full">
            <LiveEventStream events={state.eventStream} />
          </div>
        </div>

        {/* 4. BOTTOM AREA (3 Equal Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-[180px] shrink-0">
          {/* Column 1: Workspace Changes (Git-style) */}
          <div className="h-full">
            <WorkspaceChangesPanel fileChanges={state.fileChanges} />
          </div>

          {/* Column 2: Verification Checklist */}
          <div className="h-full">
            <VerificationChecklistPanel verification={state.verification} />
          </div>

          {/* Column 3: System Console Terminal */}
          <div className="h-full">
            <SystemConsoleTerminal logs={state.systemConsoleLogs} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
