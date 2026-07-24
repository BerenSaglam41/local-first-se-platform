import React, { useRef, useEffect } from 'react';
import { DashboardAiSession } from '../types/dashboard';
import { Terminal, Cpu, Zap, CheckCircle2, Wrench, Folder } from 'lucide-react';

interface AiSessionTerminalProps {
  session?: DashboardAiSession;
}

export const AiSessionTerminal: React.FC<AiSessionTerminalProps> = ({ session }) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.streamingOutput]);

  if (!session) {
    return (
      <div className="panel-card p-3 rounded-lg flex items-center justify-center h-full text-slate-500 font-mono text-xs">
        Select a worker to monitor AI Runtime Session
      </div>
    );
  }

  return (
    <div className="panel-card p-3 rounded-lg flex flex-col h-full bg-[#050810] border-purple-500/30">
      {/* Session Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 mb-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
          <span className="font-bold text-slate-200">{session.workerName}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-slate-400">Tokens: {session.tokenUsage || 0}</span>
          <span className="text-emerald-400 font-semibold">{session.durationMs}ms</span>
          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 font-bold">
            {session.status}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col space-y-2 overflow-y-auto pr-1 font-mono text-[11px]">
        {/* Prompt Box (Cursor AI Style) */}
        <div className="bg-[#090e1c] p-2.5 rounded border border-purple-500/20">
          <span className="text-[10px] text-purple-400 uppercase tracking-wider block font-bold mb-1">
            Prompt Context
          </span>
          <p className="text-slate-200 text-xs leading-relaxed">"{session.prompt}"</p>
        </div>

        {/* Streaming Terminal (Warp / Cursor Style) */}
        <div className="flex-1 terminal-box p-2.5 rounded border border-white/[0.06] overflow-y-auto space-y-1 font-mono text-[11px] text-slate-300 min-h-[120px]">
          <div className="text-[10px] text-slate-500 pb-1 border-b border-white/[0.04] flex items-center justify-between">
            <span>RUNNING LOG ({session.providerName})</span>
            <span className="text-cyan-400">AUTO-SCROLL</span>
          </div>

          {session.streamingOutput.map((line, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-cyan-400 font-bold">&gt;</span>
              <span className={line.includes('PASSED') ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
                {line}
              </span>
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>

        {/* Tool Calls */}
        {session.toolCalls && session.toolCalls.length > 0 && (
          <div className="bg-[#080d1a] p-2 rounded border border-slate-800 text-[10px] flex items-center justify-between text-slate-400">
            <div className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <Wrench className="w-3 h-3 text-cyan-400" />
              <span>Tool Executed: {session.toolCalls[0].toolName}()</span>
            </div>
            <span className="text-emerald-400 font-mono">{session.toolCalls[0].durationMs}ms</span>
          </div>
        )}

        {/* Final Response */}
        {session.finalResponse && (
          <div className="bg-emerald-950/20 p-2 rounded border border-emerald-500/30 text-[11px] text-emerald-300">
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold mb-1">
              <CheckCircle2 className="w-3 h-3" />
              FINAL RESPONSE
            </div>
            <p className="leading-relaxed">{session.finalResponse}</p>
          </div>
        )}

        {/* Workspace Path */}
        <div className="text-[10px] text-slate-500 flex items-center gap-1">
          <Folder className="w-3 h-3 text-slate-400" />
          <span>Workspace: {session.workspacePath}</span>
        </div>
      </div>
    </div>
  );
};
