import React from 'react';
import { DashboardTaskNode } from '../types/dashboard';
import { GitBranch, CheckCircle, Clock, ShieldAlert, ChevronRight, User } from 'lucide-react';

interface MissionDagGraphProps {
  tasks: DashboardTaskNode[];
  onSelectTask?: (task: DashboardTaskNode) => void;
}

export const MissionDagGraph: React.FC<MissionDagGraphProps> = ({ tasks, onSelectTask }) => {
  return (
    <div className="hud-card p-4 rounded-xl flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-sm text-slate-200 tracking-wide">MISSION DAG GRAPH</h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded">
          {tasks.length} DAG Nodes
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {tasks.map((task, idx) => {
          const isDone = task.status === 'COMPLETED';
          const isRunning = task.status === 'RUNNING';

          return (
            <div
              key={task.id}
              onClick={() => onSelectTask && onSelectTask(task)}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${
                isDone
                  ? 'bg-slate-900/60 border-emerald-500/30 hover:border-emerald-500/60'
                  : isRunning
                  ? 'bg-cyan-950/40 border-cyan-500/50 shadow-md shadow-cyan-500/10 animate-pulse'
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 border border-cyan-800/40">
                    Step {idx + 1}
                  </span>
                  <h4 className="text-xs font-semibold text-slate-100 truncate max-w-[180px]">
                    {task.title}
                  </h4>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                      isDone
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : isRunning
                        ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : isRunning ? (
                      <Clock className="w-3 h-3 animate-spin" />
                    ) : (
                      <ShieldAlert className="w-3 h-3" />
                    )}
                    {task.status}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{task.description}</p>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/50">
                <div className="flex items-center gap-1 text-slate-300">
                  <User className="w-3 h-3 text-cyan-400" />
                  <span>{task.assignedWorkerId || 'Unassigned'}</span>
                </div>
                {task.dependencies.length > 0 && (
                  <div className="flex items-center gap-1 text-slate-500">
                    <span>Deps:</span>
                    <span className="text-slate-400">{task.dependencies.length}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
