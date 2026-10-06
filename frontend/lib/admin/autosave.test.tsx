import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "./autosave";

describe("useAutosave — автосохранение черновика", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("сохраняет через паузу после изменений, не на каждый символ", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ value }) => useAutosave(value, save, { delay: 1000 }), {
      initialProps: { value: { name: "Да" } },
    });
    expect(result.current.status).toBe("idle");
    rerender({ value: { name: "Да Х" } });
    rerender({ value: { name: "Да Хун" } });
    expect(result.current.status).toBe("pending");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ name: "Да Хун" });
    expect(result.current.status).toBe("saved");
  });

  it("ошибка сохранения видна", async () => {
    const save = vi.fn().mockRejectedValue(new Error("сеть"));
    const { result, rerender } = renderHook(({ value }) => useAutosave(value, save, { delay: 500 }), {
      initialProps: { value: 1 },
    });
    rerender({ value: 2 });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe("error");
  });

  it("выключено — не сохраняет", async () => {
    const save = vi.fn();
    const { rerender } = renderHook(({ value }) => useAutosave(value, save, { delay: 100, enabled: false }), {
      initialProps: { value: 1 },
    });
    rerender({ value: 2 });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(save).not.toHaveBeenCalled();
  });
});
