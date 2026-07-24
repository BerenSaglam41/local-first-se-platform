import React from 'react';
import { DashboardDomainEvent } from '../types/dashboard';
import { Radio, Zap, Clock } from 'lucide-react';

interface LiveEventStreamProps {
  events: DashboardDomainEvent[];
}

export const LiveEventStream: React.FC<LiveEventStreamProps> = ({ events }) => {
  return (
    <div className="hud-card p-4 rounded-xl flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
          <h3 className="font-bold text-sm text-slate-200 tracking-wide">LIVE EVENT STREAM</h3>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
          {events.length} Events
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[11px]">
        {events.map((evt) => {
          const time = new Date(evt.timestamp).toLocaleTimeString();
          const isPassed = evt.eventType.includes('Passed') || evt.eventType.includes('Completed');
          const isStarted = evt.eventType.includes('Started') || evt.eventType.includes('Assigned');

          return (
            <div
              key={evt.eventId}
              className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/80 hover:border-cyan-500/30 transition-all flex items-start gap-2.5"
            >
              <div className="text-[10px] text-slate-500 flex items-center gap-1 min-w-[65px]">
                <Clock className="w-3 h-3" />
                {time}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                      isPassed
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : isStarted
                        ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                        : 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                    }`}
                  >
                    {evt.eventType}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">[{evt.actorId}]</span>
                </div>
                <p className="text-slate-300 text-[10px] mt-1 truncate">
                  {JSON.stringify(evt.payload)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
