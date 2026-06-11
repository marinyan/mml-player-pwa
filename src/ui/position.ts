export function formatPosition(positionSec: number, durationSec: number): string {
  const duration = Math.max(durationSec, 0);
  const position = Math.min(Math.max(positionSec, 0), duration);
  return `${position.toFixed(1)}s / ${duration.toFixed(1)}s`;
}
