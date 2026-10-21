import React, { useCallback, useState } from 'react';
import { AlertCircleIcon, CheckCircleIcon, XIcon } from './Icons.jsx';

const TOAST_LIFETIME = 5000;

/** Small stack of transient confirmations / failures. */
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), TOAST_LIFETIME);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}

export default function Toasts({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
          {toast.tone === 'error' ? <AlertCircleIcon size={17} /> : <CheckCircleIcon size={17} />}
          <p className="min-w-0 flex-1">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="icon-btn -my-1 -mr-1 !h-6 !w-6"
            aria-label="Dismiss notification"
          >
            <XIcon size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
