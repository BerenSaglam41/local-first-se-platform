import React, { useState } from 'react';
import { DashboardDomainEvent } from '../types/dashboard';
import { Radio, Search, Filter } from 'lucide-react';

interface LiveEventStreamProps {
  events: DashboardDomainEvent[];
}

export const LiveEventStream: React.FC<LiveEventStreamProps> = ({ events }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEvents = events.filter(
    (e) =>
      e.eventType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.actorId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="panel-card p-3 rounded-lg flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="font-bold tracking-wider uppercase text-slate-200">Live Domain Events</span>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search events..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-[10px] text-slate-300 focus:outline-none focus:border-cyan-500/50 w-28"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono text-[10px]">
        {filteredEvents.map((evt) => {
          const time = new Date(evt.timestamp).toLocaleTimeString();
          const isPassed = evt.eventType.includes('Passed') || evt.eventType.includes('Completed');
          const isStarted = evt.eventType.includes('Started') || evt.eventType.includes('Assigned');

          return (
            <div
              key={evt.eventId}
              className="p-2 rounded bg-slate-950/40 border border-slate-800/60 flex items-start justify-between gap-2"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-slate-500 font-bold">{time}</span>
                <span
                  className={`font-semibold px-1.5 py-0.2 rounded ${
                    isPassed
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : isStarted
                      ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                      : 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                  }`}
                >
                  {evt.eventType}
                </span>
                <span className="text-slate-400 truncate">[{evt.actorId}]</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
