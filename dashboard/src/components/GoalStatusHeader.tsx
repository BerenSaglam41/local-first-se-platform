import React from 'react';
import { Target, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

interface GoalStatusHeaderProps {
  projectId: string;
  businessGoal: string;
  projectStatus: string;
  progressPercent: number;
}

export const GoalStatusHeader: React.FC<GoalStatusHeaderProps> = ({
  projectId,
  businessGoal,
  projectStatus,
  progressPercent,
}) => {
  const isCompleted = projectStatus === 'COMPLETED';
  const isExecuting = projectStatus === 'EXECUTING';

  return (
    <div className="hud-card p-4 rounded-xl border border-cyan-500/20 bg-[#0c1324]/80 relative overflow-hidden">
      <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mt-0.5">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono tracking-wider text-slate-400 uppercase">
                Active Business Goal
              </span>
              <span className="text-[11px] font-mono text-cyan-400/80 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                {projectId}
              </span>
            </div>
            <h2 className="text-base md:text-lg font-bold text-slate-100 tracking-wide mt-0.5">
              "{businessGoal}"
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-4 min-w-[240px]">
          <div className="flex-1">
            <div className="flex justify-between items-center text-xs font-mono mb-1.5">
              <span className="text-slate-400">Execution Progress</span>
              <span className="text-cyan-300 font-bold">{progressPercent}%</span>
            </div>
            <div className="h-2 w-full bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-500 shadow-sm shadow-cyan-500/50"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div
            className={`px-3 py-1.5 rounded-lg border font-mono text-xs flex items-center gap-2 ${
              isCompleted
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : isExecuting
                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 animate-pulse'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : isExecuting ? (
              <Clock className="w-4 h-4 animate-spin" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            <span className="font-bold tracking-wider">{projectStatus}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
