import React, { useRef, useEffect } from 'react';
import { SystemTerminalLog } from '../types/dashboard';
import { Terminal, Shield, CheckCircle2 } from 'lucide-react';

interface SystemConsoleTerminalProps {
  logs: SystemTerminalLog[];
}

export const SystemConsoleTerminal: React.FC<SystemConsoleTerminalProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="panel-card p-3 rounded-lg flex flex-col h-full bg-[#04060a] border-white/[0.06]">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-bold tracking-wider uppercase text-slate-200">System Console</span>
        </div>
        <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
          LOG STREAM
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px] text-emerald-400/90 pr-1">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 leading-relaxed">
            <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
            <span className={log.level === 'SUCCESS' ? 'text-emerald-400 font-semibold' : log.level === 'WARN' ? 'text-amber-400' : 'text-slate-300'}>
              {log.message}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
