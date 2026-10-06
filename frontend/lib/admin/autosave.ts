"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface State<T> {
  saved: T;
  phase: "idle" | "saving" | "saved" | "error";
}

/**
 * Автосохранение черновика (SPEC 10.1): после паузы в наборе сохраняем последнее значение.
 * Первое значение (загруженное с сервера) считается уже сохранённым.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<unknown>,
  { delay = 1500, enabled = true }: { delay?: number; enabled?: boolean } = {},
): { status: AutosaveStatus; flush: () => Promise<void> } {
  const [state, setState] = useState<State<T>>({ saved: value, phase: "idle" });
  const saveRef = useRef(save);
  const changed = value !== state.saved;

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const persist = useRef(async (next: T) => {
    setState((s) => ({ ...s, phase: "saving" }));
    try {
      await saveRef.current(next);
      setState({ saved: next, phase: "saved" });
    } catch {
      setState((s) => ({ ...s, phase: "error" }));
    }
  });

  useEffect(() => {
    if (!enabled || !changed) return;
    const timer = setTimeout(() => void persist.current(value), delay);
    return () => clearTimeout(timer);
  }, [value, changed, delay, enabled]);

  let status: AutosaveStatus;
  if (state.phase === "saving") status = "saving";
  else if (state.phase === "error") status = "error";
  else if (changed) status = "pending";
  else status = state.phase;

  return {
    status,
    flush: async () => {
      if (changed) await persist.current(value);
    },
  };
}

export const AUTOSAVE_LABELS: Record<AutosaveStatus, string> = {
  idle: "",
  pending: "Есть несохранённые изменения…",
  saving: "Сохраняем…",
  saved: "Черновик сохранён",
  error: "Не удалось сохранить — проверьте интернет",
};
