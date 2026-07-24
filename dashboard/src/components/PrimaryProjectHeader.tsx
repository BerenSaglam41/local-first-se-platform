import React from 'react';
import { Target, CheckCircle2, Clock, Play } from 'lucide-react';

interface PrimaryProjectHeaderProps {
  projectId: string;
  businessGoal: string;
  projectStatus: string;
  currentStage: string;
  estimatedCompletionMinutes: number;
  progressPercent: number;
}

export const PrimaryProjectHeader: React.FC<PrimaryProjectHeaderProps> = ({
  projectId,
  businessGoal,
  projectStatus,
  currentStage,
  estimatedCompletionMinutes,
  progressPercent,
}) => {
  const isExecuting = projectStatus === 'EXECUTING';

  return (
    <div className="panel-card p-4 border-cyan-500/30 bg-gradient-to-r from-[#0d1322] via-[#090f1d] to-[#080d19] relative overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Focal Point: Business Goal */}
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mt-0.5">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
                Current Project Goal
              </span>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
                {projectId}
              </span>
            </div>
            {/* Primary Large Typography */}
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-100 tracking-tight mt-0.5">
              "{businessGoal}"
            </h1>
          </div>
        </div>

        {/* Right Focal Point: Current Stage & Progress Bar */}
        <div className="flex flex-col md:flex-row md:items-center gap-6 min-w-[340px]">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-cyan-400 font-semibold">{currentStage}</span>
              <span className="text-slate-300 font-bold">{progressPercent}%</span>
            </div>

            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-500 shadow-sm shadow-cyan-500/50"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
              <span>ESTIMATED REMAINING: {estimatedCompletionMinutes} MIN</span>
              <span>PARALLEL BATCHES: ACTIVE</span>
            </div>
          </div>

          <div
            className={`px-3.5 py-2 rounded-lg border font-mono text-xs flex items-center gap-2 shadow-lg ${
              isExecuting
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 animate-pulse'
                : 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
            }`}
          >
            {isExecuting ? <Play className="w-4 h-4 text-emerald-400 fill-emerald-400/20" /> : <CheckCircle2 className="w-4 h-4" />}
            <span className="font-bold tracking-wider">{projectStatus}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
