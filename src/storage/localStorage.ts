const key = "mml-player-pwa:mml";
const lastExportedKey = "mml-player-pwa:last-exported-mml";

export function loadSavedMml(fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveMml(value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

export function loadLastExportedMml(): string | null {
  try {
    return window.localStorage.getItem(lastExportedKey);
  } catch {
    return null;
  }
}

export function saveLastExportedMml(value: string): void {
  try {
    window.localStorage.setItem(lastExportedKey, value);
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}
