import React from 'react';
import { DashboardWorker } from '../types/dashboard';
import { Users, Bot, HardDrive, Clock, ChevronRight } from 'lucide-react';

interface WorkerFleetPanelProps {
  workers: DashboardWorker[];
  selectedWorkerId?: string;
  onSelectWorker?: (worker: DashboardWorker) => void;
}

export const WorkerFleetPanel: React.FC<WorkerFleetPanelProps> = ({
  workers,
  selectedWorkerId,
  onSelectWorker,
}) => {
  return (
    <div className="panel-card p-3 rounded-lg flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-200">
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-bold tracking-wider uppercase">Worker Fleet</span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
          {workers.length} Active
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono">
        {workers.map((worker) => {
          const isSelected = selectedWorkerId === worker.id;
          const isExecuting = worker.status === 'EXECUTING' || worker.status === 'REASONING';

          return (
            <div
              key={worker.id}
              onClick={() => onSelectWorker && onSelectWorker(worker)}
              className={`p-2.5 rounded-md border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-purple-950/40 border-purple-400 shadow-md shadow-purple-500/10'
                  : isExecuting
                  ? 'bg-emerald-950/30 border-emerald-500/40'
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-slate-800 text-emerald-400">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{worker.name}</h4>
                    <span className="text-[10px] text-slate-400">{worker.role} ({worker.departmentName})</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      isExecuting
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {worker.status}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>

              <div className="mt-2 pt-1.5 border-t border-white/[0.04] space-y-1 text-[10px] text-slate-400">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Provider:</span>
                  <span className="text-cyan-300 font-semibold">{worker.runtimeProvider}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Task:</span>
                  <span className="text-slate-200 truncate max-w-[150px]">{worker.currentTaskTitle}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
