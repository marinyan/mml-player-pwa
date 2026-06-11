import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebouncedTask } from "./debouncedTask";

afterEach(() => {
  vi.useRealTimers();
});

describe("createDebouncedTask", () => {
  it("runs only once after rapid scheduling", () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 150);

    debounced.schedule();
    debounced.schedule();
    vi.advanceTimersByTime(149);
    expect(task).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledOnce();
  });

  it("can cancel pending work", () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 150);

    debounced.schedule();
    debounced.cancel();
    vi.runAllTimers();

    expect(task).not.toHaveBeenCalled();
  });
});
