import { defaultMml } from "../demo/defaultMml";

export function shouldWarnBeforeReplacingMml(currentMml: string, lastExportedMml: string | null): boolean {
  return currentMml !== defaultMml && currentMml !== lastExportedMml;
}

export function confirmBeforeReplacingMml(
  currentMml: string,
  lastExportedMml: string | null,
  confirm: (message: string) => boolean
): boolean {
  if (!shouldWarnBeforeReplacingMml(currentMml, lastExportedMml)) return true;
  return confirm(
    "現在のMMLは未エクスポート、または最後のエクスポート後に変更されています。\n" +
      "このまま読み込むと現在のエディタ内容が置き換わります。続行しますか？"
  );
}
