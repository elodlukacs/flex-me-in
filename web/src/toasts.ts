import { useSyncExternalStore } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
  action?: ToastAction;
  /** ms; 0 keeps it until dismissed. */
  duration: number;
}

type Listener = () => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit(): void {
  for (const l of listeners) l();
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Shows a toast; at most two are on screen, the newest at the bottom. */
export function showToast(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}): number {
  const id = nextId++;
  const toast: Toast = {
    id,
    message,
    tone: options.tone ?? 'info',
    action: options.action,
    duration: options.duration ?? (options.action ? 6000 : 3500),
  };
  const dropped = toasts.slice(0, Math.max(0, toasts.length - 1));
  for (const t of dropped) {
    const timer = timers.get(t.id);
    if (timer) clearTimeout(timer);
    timers.delete(t.id);
  }
  toasts = [...toasts.slice(-1), toast];
  if (toast.duration > 0) timers.set(id, setTimeout(() => dismissToast(id), toast.duration));
  emit();
  return id;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts);
}
