import React from 'react';
import { useToastStore } from '../store';
import { CheckIcon, XIcon, AlertIcon } from './Icons';

export default function Toast() {
  const { toasts, remove } = useToastStore();

  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => remove(t.id)}>
          {t.type === 'success' && <CheckIcon size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />}
          {t.type === 'error' && <XIcon size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />}
          {t.type === 'info' && <AlertIcon size={15} style={{ color: 'var(--pink)', flexShrink: 0 }} />}
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button
            className="toast-dismiss"
            onClick={(e) => { e.stopPropagation(); remove(t.id); }}
            title="Dismiss"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 4px', fontSize: 14, lineHeight: 1, flexShrink: 0 }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
