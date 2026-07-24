import React from 'react';
import { DashboardVerificationStatus } from '../types/dashboard';
import { ShieldCheck, CheckCircle2, XCircle, Award } from 'lucide-react';

interface VerificationChecklistPanelProps {
  verification: DashboardVerificationStatus;
}

export const VerificationChecklistPanel: React.FC<VerificationChecklistPanelProps> = ({
  verification,
}) => {
  const isPassed = verification.status === 'PASSED';

  return (
    <div className="panel-card p-3 rounded-lg flex flex-col h-full bg-[#060c18] border-teal-500/20">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
          <span className="font-bold tracking-wider uppercase text-slate-200">Verification Pipeline</span>
        </div>

        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
            isPassed
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/10 text-red-400 border border-red-500/30'
          }`}
        >
          {isPassed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {verification.status}
        </span>
      </div>

      <div className="flex-1 flex items-center justify-between gap-4 font-mono">
        {/* Checklist Steps (Left) */}
        <div className="space-y-1.5 flex-1">
          {verification.steps.map((step, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-medium text-slate-200">{step.name.replace('Check', '')}</span>
              </div>
              <span className="text-[10px] text-slate-500">{step.durationMs}ms</span>
            </div>
          ))}
        </div>

        {/* Large Quality Score Badge (Right) */}
        <div className="p-3 rounded-lg bg-slate-900/80 border border-teal-500/30 text-center min-w-[110px] flex flex-col items-center justify-center">
          <Award className="w-5 h-5 text-teal-400 mb-1" />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">SCORE</span>
          <span className="text-2xl font-extrabold text-teal-300 tracking-tight">
            {verification.qualityScore}
          </span>
          <span className="text-[9px] text-emerald-400">PASSED 6/6</span>
        </div>
      </div>
    </div>
  );
};
