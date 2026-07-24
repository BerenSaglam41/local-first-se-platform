import React from 'react';
import { DashboardTaskNode } from '../types/dashboard';
import { GitBranch, CheckCircle2, Play, ShieldAlert, ArrowRight } from 'lucide-react';

interface MissionDagGraphProps {
  tasks: DashboardTaskNode[];
  selectedTaskId?: string;
  onSelectTask?: (task: DashboardTaskNode) => void;
}

export const MissionDagGraph: React.FC<MissionDagGraphProps> = ({
  tasks,
  selectedTaskId,
  onSelectTask,
}) => {
  return (
    <div className="panel-card p-3 rounded-lg flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-200">
          <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold tracking-wider uppercase">Mission Graph (DAG)</span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded">
          {tasks.length} Nodes
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono">
        {tasks.map((task, idx) => {
          const isDone = task.status === 'COMPLETED';
          const isRunning = task.status === 'RUNNING';
          const isSelected = selectedTaskId === task.id;

          return (
            <div
              key={task.id}
              onClick={() => onSelectTask && onSelectTask(task)}
              className={`p-2.5 rounded-md border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-cyan-950/40 border-cyan-400 shadow-md shadow-cyan-500/10'
                  : isRunning
                  ? 'bg-emerald-950/30 border-emerald-500/50'
                  : isDone
                  ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                  : 'bg-slate-950/40 border-slate-800/60 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[10px] text-slate-500 font-bold">#{idx + 1}</span>
                  <span className="font-medium text-slate-200 truncate">{task.title}</span>
                </div>

                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 ${
                    isDone
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : isRunning
                      ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 animate-pulse'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : isRunning ? (
                    <Play className="w-3 h-3 text-cyan-400 fill-cyan-400" />
                  ) : (
                    <ShieldAlert className="w-3 h-3" />
                  )}
                  {task.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 pt-1.5 border-t border-white/[0.04]">
                <span className="text-slate-400">Worker: {task.assignedWorkerId || 'Unassigned'}</span>
                {task.dependencies.length > 0 && (
                  <span className="text-slate-500 flex items-center gap-1">
                    <ArrowRight className="w-2.5 h-2.5" />
                    Dep: {task.dependencies.join(', ')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
