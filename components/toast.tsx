"use client";

import { useEffect, useState, useCallback } from "react";

// Minimal self-contained toast system. One hook provides {push, toasts} +
// renders a <ToastViewport/> that displays them. No dependency.

export interface Toast {
  id: number;
  tone: "info" | "success" | "warn" | "error";
  title: string;
  detail?: string;
}

let _id = 0;
function nextId() {
  _id += 1;
  return _id;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId();
    setToasts((xs) => [...xs, { id, ...t }]);
    setTimeout(() => {
      setToasts((xs) => xs.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  return { toasts, push };
}

export function ToastViewport({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const toneCls: Record<Toast["tone"], string> = {
    info: "border-sky-500/40 bg-sky-900/90 text-sky-100",
    success: "border-emerald-500/40 bg-emerald-900/90 text-emerald-100",
    warn: "border-amber-500/40 bg-amber-900/90 text-amber-100",
    error: "border-rose-500/40 bg-rose-900/90 text-rose-100",
  };
  const iconMap: Record<Toast["tone"], string> = {
    info: "ℹ",
    success: "✓",
    warn: "⚠",
    error: "⨯",
  };
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className={`pointer-events-auto rounded-lg border p-3 shadow-xl backdrop-blur transition-all duration-200 ${
        toneCls[toast.tone]
      } ${visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
    >
      <div className="flex gap-2 items-start">
        <span className="text-lg leading-none">{iconMap[toast.tone]}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{toast.title}</div>
          {toast.detail && (
            <div className="text-xs opacity-80 mt-0.5">{toast.detail}</div>
          )}
        </div>
      </div>
    </div>
  );
}
