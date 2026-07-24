import React, { useState, useEffect } from 'react';
import { Cpu, Server, Activity, HardDrive, Clock } from 'lucide-react';

interface TopSystemBarProps {
  kernelStatus: string;
  runtimeProvider: string;
  totalWorkersCount: number;
  runningTasksCount: number;
  queuedTasksCount: number;
  memoryUsageMB: number;
  cpuLoadPercent: number;
}

export const TopSystemBar: React.FC<TopSystemBarProps> = ({
  kernelStatus,
  runtimeProvider,
  totalWorkersCount,
  runningTasksCount,
  queuedTasksCount,
  memoryUsageMB,
  cpuLoadPercent,
}) => {
  const [timeStr, setTimeStr] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => setTimeStr(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-[#090d16] border-b border-white/[0.08] px-4 py-2 flex items-center justify-between font-mono text-xs text-slate-300">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 font-bold text-slate-100">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span className="tracking-wider">SE-OS v2.0</span>
        </div>

        <div className="h-3.5 w-px bg-white/10" />

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Kernel:</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {kernelStatus}
          </span>
        </div>

        <div className="h-3.5 w-px bg-white/10 hidden md:block" />

        <div className="hidden md:flex items-center gap-1.5">
          <span className="text-slate-500">Runtime:</span>
          <span className="text-cyan-300 font-semibold">{runtimeProvider}</span>
        </div>
      </div>

      <div className="flex items-center gap-5 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Workers:</span>
          <span className="text-slate-200 font-bold">{totalWorkersCount}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Running:</span>
          <span className="text-emerald-400 font-bold">{runningTasksCount}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Queue:</span>
          <span className="text-amber-400 font-bold">{queuedTasksCount}</span>
        </div>

        <div className="h-3.5 w-px bg-white/10 hidden lg:block" />

        <div className="hidden lg:flex items-center gap-1.5">
          <HardDrive className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">{memoryUsageMB} MB</span>
        </div>

        <div className="hidden lg:flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">{cpuLoadPercent}%</span>
        </div>

        <div className="h-3.5 w-px bg-white/10" />

        <div className="flex items-center gap-1 text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{timeStr}</span>
        </div>
      </div>
    </header>
  );
};
