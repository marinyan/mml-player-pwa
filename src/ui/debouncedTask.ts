export interface DebouncedTask {
  schedule(): void;
  cancel(): void;
}

export function createDebouncedTask(task: () => void, delayMs: number): DebouncedTask {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(): void {
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = null;
        task();
      }, delayMs);
    },
    cancel(): void {
      if (timerId === null) return;
      clearTimeout(timerId);
      timerId = null;
    }
  };
}
