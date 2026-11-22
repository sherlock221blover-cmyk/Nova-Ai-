import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { ConfirmationRequest } from '../types/nova';

interface ConfirmActionModalProps {
  request: ConfirmationRequest | null;
  onClose: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  request,
  onClose,
}) => {
  const [busy, setBusy] = useState(false);

  if (!request) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await request.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#0D1B38] border border-sky-400/20 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                request.destructive
                  ? 'bg-rose-500/15 text-rose-300 border border-rose-400/25'
                  : 'bg-sky-500/15 text-sky-300 border border-sky-400/25'
              }`}
            >
              {request.destructive ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
            <h2
              id="confirm-modal-title"
              className="font-display text-lg font-semibold text-slate-100"
            >
              {request.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close confirmation dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">{request.description}</p>

        {request.details && request.details.length > 0 && (
          <ul className="space-y-1.5 rounded-xl bg-[#081126] border border-sky-400/10 p-3.5 text-xs text-slate-300">
            {request.details.map((line, i) => (
              <li key={i} className="leading-relaxed break-words">
                {line}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap disabled:opacity-60 ${
              request.destructive
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {busy ? 'Working...' : request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
