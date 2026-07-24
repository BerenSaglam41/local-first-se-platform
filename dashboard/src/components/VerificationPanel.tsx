import React from 'react';
import { DashboardVerificationStatus } from '../types/dashboard';
import { ShieldCheck, CheckCircle2, XCircle, Award } from 'lucide-react';

interface VerificationPanelProps {
  verification: DashboardVerificationStatus;
}

export const VerificationPanel: React.FC<VerificationPanelProps> = ({ verification }) => {
  const isPassed = verification.status === 'PASSED';

  return (
    <div className="hud-card p-4 rounded-xl flex flex-col h-full bg-[#060c18] border-teal-500/20">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-400" />
          <h3 className="font-bold text-sm text-slate-200 tracking-wide">VERIFICATION PIPELINE</h3>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
              isPassed
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}
          >
            {isPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {verification.status}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800 mb-3">
        <div className="flex items-center gap-2.5">
          <Award className="w-6 h-6 text-teal-400" />
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Overall Quality Score
            </span>
            <span className="text-lg font-extrabold font-mono text-teal-300 glow-text-cyan">
              {verification.qualityScore} / 100
            </span>
          </div>
        </div>

        <span className="text-xs font-mono text-slate-400">
          Passed: <strong className="text-emerald-400">{verification.passedStepsCount}</strong> / {verification.totalStepsCount}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
        {verification.steps.map((step, idx) => (
          <div
            key={idx}
            className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <div>
                <span className="text-slate-200 font-semibold text-[11px]">{step.name}</span>
                <span className="text-[10px] text-slate-500 block">{step.category}</span>
              </div>
            </div>

            <span className="text-[10px] text-emerald-400">{step.durationMs}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
};
