import React from 'react';
import { GitFileChange } from '../types/dashboard';
import { GitCommit, FilePlus, FileEdit, FileMinus } from 'lucide-react';

interface WorkspaceChangesPanelProps {
  fileChanges: GitFileChange[];
}

export const WorkspaceChangesPanel: React.FC<WorkspaceChangesPanelProps> = ({ fileChanges }) => {
  return (
    <div className="panel-card p-3 rounded-lg flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold tracking-wider uppercase text-slate-200">Git Workspace Changes</span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded">
          {fileChanges.length} Files
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[11px]">
        {fileChanges.map((change, idx) => {
          const isCreated = change.status === 'CREATED';
          const isModified = change.status === 'MODIFIED';

          return (
            <div
              key={idx}
              className="p-2.5 rounded bg-slate-950/50 border border-slate-800 space-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  {isCreated ? (
                    <FilePlus className="w-3.5 h-3.5 text-emerald-400" />
                  ) : isModified ? (
                    <FileEdit className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <FileMinus className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className="text-slate-200 font-semibold truncate max-w-[200px]">{change.path}</span>
                </div>

                <div className="flex items-center gap-2 text-[10px]">
                  {change.additions > 0 && <span className="text-emerald-400 font-bold">+{change.additions}</span>}
                  {change.deletions > 0 && <span className="text-red-400 font-bold">-{change.deletions}</span>}
                  <span className="text-slate-500">{change.fileSizeBytes} B</span>
                </div>
              </div>

              {change.diffSnippet && (
                <div className="bg-[#04060a] p-1.5 rounded border border-white/[0.04] text-[10px] text-slate-300 font-mono overflow-x-auto whitespace-pre">
                  {change.diffSnippet}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
