// A quiet confirmation of what just happened, announced politely, with at most one action.
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  error?: boolean;
}

type Show = (text: string, action?: Toast["action"], options?: { error?: boolean }) => void;

const Context = createContext<Show>(() => undefined);

export function ToastProvider({ children, lasts = 6000 }: { children: ReactNode; lasts?: number }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const show = useCallback<Show>(
    (text, action, options) => {
      const id = ++next.current;
      setToasts((current) => [...current, { id, text, action, error: options?.error }]);
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), lasts);
    },
    [lasts],
  );
  return (
    <Context.Provider value={show}>
      {children}
      <div className="ds-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`ds-toast ${toast.error ? "is-err" : ""}`}>
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  setToasts((current) => current.filter((item) => item.id !== toast.id));
                  toast.action!.run();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}

export function useToast(): Show {
  return useContext(Context);
}
