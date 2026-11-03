import { useEffect, useId, useRef } from 'react';

interface ConfirmSheetProps {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Bottom sheet asking to confirm one action; Escape or tapping outside cancels. */
export function ConfirmSheet({ title, body, confirmLabel, onConfirm, onCancel }: ConfirmSheetProps) {
  const titleId = useId();
  const confirmBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div
        className="sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sheet-title">
          {title}
        </h2>
        <p className="sheet-body">{body}</p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-block" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-block" ref={confirmBtn} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
