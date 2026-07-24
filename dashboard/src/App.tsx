import React, { useState } from 'react';
import { SeOsApiService } from './services/se_os_api';
import { HeaderHUD } from './components/HeaderHUD';
import { GoalStatusHeader } from './components/GoalStatusHeader';
import { MissionDagGraph } from './components/MissionDagGraph';
import { WorkerFleetPanel } from './components/WorkerFleetPanel';
import { AiSessionTerminal } from './components/AiSessionTerminal';
import { LiveEventStream } from './components/LiveEventStream';
import { WorkspaceArtifactsPanel } from './components/WorkspaceArtifactsPanel';
import { VerificationPanel } from './components/VerificationPanel';

export const App: React.FC = () => {
  const [state] = useState(() => SeOsApiService.fetchDashboardState());

  const completedTasksCount = state.tasks.filter((t) => t.status === 'COMPLETED').length;

  return (
    <div className="min-h-screen flex flex-col bg-[#070b12] text-slate-100 selection:bg-cyan-500/30">
      {/* 1. Header System Status HUD */}
      <HeaderHUD
        activeWorkersCount={state.workers.length}
        totalTasksCount={state.tasks.length}
        completedTasksCount={completedTasksCount}
        qualityScore={state.verification.qualityScore}
      />

      {/* Main Single-Screen Mission Control Grid */}
      <main className="flex-1 p-4 md:p-6 space-y-4 max-w-[1920px] mx-auto w-full">
        {/* 2. Business Goal & Project Status Header */}
        <GoalStatusHeader
          projectId={state.projectId}
          businessGoal={state.businessGoal}
          projectStatus={state.projectStatus}
          progressPercent={state.progressPercent}
        />

        {/* 3. Primary Mission Control 4-Column Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-[calc(100vh-210px)] min-h-[680px]">
          {/* Column 1: Mission DAG Node Graph */}
          <div className="h-full">
            <MissionDagGraph tasks={state.tasks} />
          </div>

          {/* Column 2: Worker Fleet & AI Runtime Sessions */}
          <div className="flex flex-col gap-4 h-full">
            <div className="h-1/2">
              <WorkerFleetPanel workers={state.workers} />
            </div>
            <div className="h-1/2">
              <AiSessionTerminal sessions={state.aiSessions} />
            </div>
          </div>

          {/* Column 3: Live Event Stream & Verification Pipeline */}
          <div className="flex flex-col gap-4 h-full">
            <div className="h-1/2">
              <LiveEventStream events={state.eventStream} />
            </div>
            <div className="h-1/2">
              <VerificationPanel verification={state.verification} />
            </div>
          </div>

          {/* Column 4: Workspace Artifacts & Output Inspector */}
          <div className="h-full">
            <WorkspaceArtifactsPanel artifacts={state.artifacts} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
