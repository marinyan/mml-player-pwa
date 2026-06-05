export function requestExportFileName(
  defaultFileName: string,
  extension: string,
  prompt: (message: string, defaultValue?: string) => string | null
): string | null {
  const answer = prompt("保存するファイル名を入力してください", defaultFileName);
  if (answer === null) return null;

  const sanitized = sanitizeFileName(answer);
  if (sanitized === "") return defaultFileName;
  return ensureExtension(sanitized, extension);
}

export function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");
}

export function ensureExtension(fileName: string, extension: string): string {
  return fileName.toLowerCase().endsWith(extension.toLowerCase()) ? fileName : `${fileName}${extension}`;
}
