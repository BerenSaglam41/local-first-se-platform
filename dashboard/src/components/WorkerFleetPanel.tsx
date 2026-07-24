import React from 'react';
import { DashboardWorker } from '../types/dashboard';
import { Users, Bot, HardDrive, Clock } from 'lucide-react';

interface WorkerFleetPanelProps {
  workers: DashboardWorker[];
}

export const WorkerFleetPanel: React.FC<WorkerFleetPanelProps> = ({ workers }) => {
  return (
    <div className="hud-card p-4 rounded-xl flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-sm text-slate-200 tracking-wide">WORKER FLEET MONITOR</h3>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
          {workers.length} Workers Fleet
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {workers.map((worker) => (
          <div
            key={worker.id}
            className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold font-mono text-xs">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">{worker.name}</h4>
                  <p className="text-[10px] font-mono text-slate-400">{worker.role} ({worker.departmentName})</p>
                </div>
              </div>

              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                {worker.status}
              </span>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/60 space-y-1.5 text-[11px] font-mono">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-slate-500">Provider:</span>
                <span className="text-cyan-300 font-semibold">{worker.runtimeProvider}</span>
              </div>

              <div className="flex items-center justify-between text-slate-400">
                <span className="text-slate-500">Task:</span>
                <span className="text-slate-200 truncate max-w-[170px]">{worker.currentTaskTitle}</span>
              </div>

              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1 text-slate-500">
                  <HardDrive className="w-3 h-3" />
                  Workspace:
                </span>
                <span className="text-slate-400 text-[10px] truncate max-w-[150px]">{worker.currentWorkspace}</span>
              </div>

              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1 text-slate-500">
                  <Clock className="w-3 h-3" />
                  Duration:
                </span>
                <span className="text-emerald-400">{worker.durationMs} ms</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
