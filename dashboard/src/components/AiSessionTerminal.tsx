import React from 'react';
import { DashboardAiSession } from '../types/dashboard';
import { Terminal, Cpu, Zap, CheckCircle2 } from 'lucide-react';

interface AiSessionTerminalProps {
  sessions: DashboardAiSession[];
}

export const AiSessionTerminal: React.FC<AiSessionTerminalProps> = ({ sessions }) => {
  return (
    <div className="hud-card p-4 rounded-xl flex flex-col h-full bg-[#060a14] border-purple-500/20">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-purple-400" />
          <h3 className="font-bold text-sm text-slate-200 tracking-wide">LIVE AI RUNTIME SESSIONS</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono bg-purple-950/60 text-purple-300 px-2 py-0.5 rounded border border-purple-800/40">
            {sessions.length} Runtime Sessions
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 font-mono text-xs">
        {sessions.map((session) => (
          <div
            key={session.sessionId}
            className="p-3.5 rounded-xl bg-[#090e1c] border border-purple-900/40 space-y-2.5 shadow-inner"
          >
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                <span className="font-bold text-purple-300">{session.providerName}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-slate-400">Tokens: {session.tokenUsage || 0}</span>
                <span className="text-emerald-400">{session.durationMs}ms</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                  {session.status}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-purple-400 uppercase tracking-wider block mb-0.5">Prompt:</span>
              <p className="text-slate-300 bg-slate-950/80 p-2 rounded border border-slate-800 text-[11px]">
                "{session.prompt}"
              </p>
            </div>

            <div>
              <span className="text-[10px] text-cyan-400 uppercase tracking-wider block mb-1">
                Streaming Output Log:
              </span>
              <div className="bg-[#040710] p-2.5 rounded border border-slate-800/80 space-y-1 max-h-32 overflow-y-auto text-[11px] text-slate-300">
                {session.streamingOutput.map((line, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-cyan-500 font-bold">&gt;</span>
                    <span className="text-slate-300">{line}</span>
                  </div>
                ))}
              </div>
            </div>

            {session.finalResponse && (
              <div className="pt-1.5 border-t border-slate-800/60">
                <span className="text-[10px] text-emerald-400 uppercase tracking-wider block mb-0.5">
                  Final Response Output:
                </span>
                <p className="text-emerald-300/90 bg-emerald-950/20 p-2 rounded border border-emerald-800/30 text-[11px]">
                  {session.finalResponse}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
