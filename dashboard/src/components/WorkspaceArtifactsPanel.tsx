import React from 'react';
import { DashboardArtifact } from '../types/dashboard';
import { FileCode, FileText, Terminal, Layers, File } from 'lucide-react';

interface WorkspaceArtifactsPanelProps {
  artifacts: DashboardArtifact[];
}

export const WorkspaceArtifactsPanel: React.FC<WorkspaceArtifactsPanelProps> = ({ artifacts }) => {
  return (
    <div className="hud-card p-4 rounded-xl flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-sm text-slate-200 tracking-wide">WORKSPACE ARTIFACTS</h3>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
          {artifacts.length} Files
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 font-mono text-xs">
        {artifacts.map((art) => {
          const isCreated = art.type === 'CREATED_FILE';
          const isLog = art.type === 'EXECUTION_LOG';

          return (
            <div
              key={art.artifactId}
              className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  {isCreated ? (
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                  ) : isLog ? (
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-purple-400" />
                  )}
                  <span className="text-slate-200 font-semibold text-[11px] truncate max-w-[200px]">
                    {art.path}
                  </span>
                </div>

                <span className="text-[10px] text-slate-400">{art.sizeBytes} B</span>
              </div>

              {art.contentSnippet && (
                <div className="bg-[#050914] p-2 rounded border border-slate-800/80 text-[10px] text-slate-300 font-mono">
                  {art.contentSnippet}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
