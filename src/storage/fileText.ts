export function createMmlTextBlob(text: string): Blob {
  return new Blob([text], { type: "text/plain;charset=utf-8" });
}
