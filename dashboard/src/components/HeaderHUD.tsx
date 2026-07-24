import React from 'react';
import { ShieldCheck, Cpu, Terminal, Activity, Layers, Radio } from 'lucide-react';

interface HeaderHUDProps {
  activeWorkersCount: number;
  totalTasksCount: number;
  completedTasksCount: number;
  qualityScore: number;
}

export const HeaderHUD: React.FC<HeaderHUDProps> = ({
  activeWorkersCount,
  totalTasksCount,
  completedTasksCount,
  qualityScore,
}) => {
  return (
    <header className="hud-card border-b border-cyan-500/20 px-6 py-3 flex items-center justify-between sticky top-0 z-50 bg-[#080d1a]/90 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <Cpu className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-wider bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
              SE-OS v2.0
            </h1>
            <p className="text-[10px] uppercase font-mono tracking-widest text-cyan-400/70">
              Autonomous Mission Control System
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
          <Radio className="w-3.5 h-3.5 animate-ping" />
          <span>SYSTEM ONLINE</span>
        </div>

        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>PROVIDER NEUTRAL</span>
        </div>
      </div>

      <div className="flex items-center gap-6 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-400">Workers:</span>
          <span className="text-cyan-300 font-bold glow-text-cyan">{activeWorkersCount} Active</span>
        </div>

        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-400">Tasks:</span>
          <span className="text-emerald-300 font-bold glow-text-emerald">
            {completedTasksCount} / {totalTasksCount}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-purple-400" />
          <span className="text-slate-400">Quality:</span>
          <span className="text-purple-300 font-bold glow-text-purple">{qualityScore}/100</span>
        </div>
      </div>
    </header>
  );
};
