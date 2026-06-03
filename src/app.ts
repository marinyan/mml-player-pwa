import { Scheduler, type PlaybackStatus } from "./audio/scheduler";
import { compileMml } from "./mml/compiler";
import { MmlError, type Song } from "./mml/types";
import { createMmlTextBlob } from "./storage/fileText";
import { loadLastExportedMml, loadSavedMml, saveLastExportedMml, saveMml } from "./storage/localStorage";

const defaultMml = `%fm @16 name="GlassBell"
algorithm=0
feedback=2
op1 ratio=1.00 detune=0 level=0.90 attack=0.01 decay=0.35 sustain=0.35 release=0.18
op2 ratio=2.00 detune=0 level=0.45 attack=0.01 decay=0.20 sustain=0.05 release=0.12
%end

%fm @17 name="FourOpLead"
algorithm=0
feedback=3
op1 ratio=1.00 detune=0 level=0.85 attack=0.01 decay=0.30 sustain=0.45 release=0.18
op2 ratio=2.00 detune=0 level=0.42 attack=0.01 decay=0.22 sustain=0.20 release=0.12
op3 ratio=3.00 detune=0 level=0.30 attack=0.01 decay=0.16 sustain=0.10 release=0.10
op4 ratio=4.00 detune=0 level=0.20 attack=0.01 decay=0.12 sustain=0.00 release=0.08
%end

// MML Player PWA demo
// FM patches, repeats, slur/tie, measures, noise, and multiple tracks.
#TIME 4/4
T132
O4 L8 V12 Q7 @17
[: C E G > C < G E D & E | F A > C F < A F E & F | :2]
G4&G8 A8 B8 > C8 < B8 A8 G8 E8 | C4 R4 @16 E8 G8 > C8 < G8 |
,
T132
O2 L8 V10 Q8 @5
[: C4 G4 C4 G4 | F4 > C4 < F4 C4 | :2]
G4 D4 G4 D4 | C2 R2 |
,
T132
O3 L8 V9 Q6 @16
R4 [: C E G > C < G E | D F A > D < A F | :2]
C2. R4 |
,
T132
O3 L8 V8 Q4 @6
[: C R C R C C R C | C R C R C C C R | :2]
C4 R4 C8 C8 R4 |`;

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <h1>MML Player</h1>
          <p>Offline PWA for iPhone Safari</p>
        </div>
        <div class="topbar-actions">
          <details id="fileMenu" class="file-menu">
            <summary>File</summary>
            <div class="file-menu-panel">
              <button id="loadDemoButton" type="button">Load demo song</button>
              <button id="importButton" type="button">Import txt/mml</button>
              <button id="exportButton" type="button">Export mml</button>
            </div>
          </details>
          <span id="offlineBadge" class="badge">checking</span>
        </div>
      </header>

      <input id="fileInput" class="visually-hidden" type="file" accept=".txt,.mml,text/plain" />

      <section class="editor-panel">
        <label class="editor-label" for="mmlInput">MML</label>
        <textarea id="mmlInput" spellcheck="false" autocomplete="off"></textarea>
      </section>

      <section class="transport" aria-label="Transport controls">
        <button id="playButton" class="primary" type="button">Play</button>
        <button id="stopButton" type="button">Stop</button>
        <button id="rewindButton" type="button">Rewind</button>
      </section>

      <section class="status-grid">
        <div>
          <span class="label">Tempo</span>
          <strong id="tempoValue">120</strong>
        </div>
        <div>
          <span class="label">Status</span>
          <strong id="statusValue">Idle</strong>
        </div>
        <div>
          <span class="label">Position</span>
          <strong id="positionValue">0.0s</strong>
        </div>
      </section>

      <output id="message" class="message" role="status"></output>
    </main>
  `;

  const input = getElement<HTMLTextAreaElement>("mmlInput");
  const fileMenu = getElement<HTMLDetailsElement>("fileMenu");
  const fileInput = getElement<HTMLInputElement>("fileInput");
  const loadDemoButton = getElement<HTMLButtonElement>("loadDemoButton");
  const importButton = getElement<HTMLButtonElement>("importButton");
  const exportButton = getElement<HTMLButtonElement>("exportButton");
  const playButton = getElement<HTMLButtonElement>("playButton");
  const stopButton = getElement<HTMLButtonElement>("stopButton");
  const rewindButton = getElement<HTMLButtonElement>("rewindButton");
  const tempoValue = getElement<HTMLElement>("tempoValue");
  const statusValue = getElement<HTMLElement>("statusValue");
  const positionValue = getElement<HTMLElement>("positionValue");
  const message = getElement<HTMLOutputElement>("message");
  const offlineBadge = getElement<HTMLElement>("offlineBadge");

  input.value = loadSavedMml(defaultMml);
  let compiled: Song | null = null;
  let lastExportedMml = loadLastExportedMml();

  const scheduler = new Scheduler({
    onStatusChange: (status) => {
      statusValue.textContent = statusLabel(status);
    },
    onTick: (positionSec) => {
      positionValue.textContent = `${positionSec.toFixed(1)}s`;
    }
  });

  const updateOnlineState = () => {
    offlineBadge.textContent = navigator.onLine ? "online" : "offline";
    offlineBadge.classList.toggle("offline", !navigator.onLine);
  };

  const compileCurrent = (): Song | null => {
    try {
      const next = compileMml(input.value);
      tempoValue.textContent = String(displayTempo(next));
      message.textContent = `${eventCount(next)} events, ${next.tracks.length} track(s), ${next.durationSec.toFixed(1)}s`;
      message.classList.remove("error");
      compiled = next;
      return next;
    } catch (error) {
      const text =
        error instanceof MmlError
          ? `Error at ${error.position}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Unknown error";
      message.textContent = text;
      message.classList.add("error");
      compiled = null;
      return null;
    }
  };

  input.addEventListener("input", () => {
    saveMml(input.value);
    compileCurrent();
  });

  loadDemoButton.addEventListener("click", () => {
    fileMenu.open = false;
    if (!confirmBeforeReplacingMml(input.value, lastExportedMml)) return;
    input.value = defaultMml;
    saveMml(input.value);
    compileCurrent();
    message.textContent = "Loaded demo song";
    message.classList.remove("error");
  });

  importButton.addEventListener("click", () => {
    fileMenu.open = false;
    if (!confirmBeforeReplacingMml(input.value, lastExportedMml)) return;
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;

    void file.text().then((text) => {
      input.value = text;
      saveMml(text);
      compileCurrent();
      message.textContent = `Imported ${file.name}`;
      message.classList.remove("error");
    }).catch((error: unknown) => {
      message.textContent = error instanceof Error ? error.message : "Import failed";
      message.classList.add("error");
    });
  });

  exportButton.addEventListener("click", () => {
    fileMenu.open = false;
    const blob = createMmlTextBlob(input.value);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mml-player.mml";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    lastExportedMml = input.value;
    saveLastExportedMml(input.value);
    message.textContent = "Exported current MML";
    message.classList.remove("error");
  });

  playButton.addEventListener("click", () => {
    const next = compileCurrent();
    if (!next || eventCount(next) === 0) return;
    void scheduler.play(next);
  });

  stopButton.addEventListener("click", () => {
    scheduler.stop();
  });

  rewindButton.addEventListener("click", () => {
    scheduler.rewind();
  });

  window.addEventListener("online", updateOnlineState);
  window.addEventListener("offline", updateOnlineState);
  updateOnlineState();
  compileCurrent();

  if (compiled === null) {
    statusValue.textContent = statusLabel(scheduler.getStatus());
  }
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

function statusLabel(status: PlaybackStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "playing":
      return "Playing";
    case "stopped":
      return "Stopped";
    case "ended":
      return "Ended";
  }
}

function eventCount(song: Song): number {
  return song.tracks.reduce((count, track) => count + track.events.length, 0);
}

function displayTempo(song: Song): number {
  return song.master.tempoEvents.at(-1)?.tempo ?? 120;
}

function confirmBeforeReplacingMml(currentMml: string, lastExportedMml: string | null): boolean {
  if (currentMml === defaultMml || currentMml === lastExportedMml) return true;
  return window.confirm(
    "現在のMMLは未エクスポート、または最後のエクスポート後に変更されています。\n" +
      "このまま読み込むと現在のエディタ内容が置き換わります。続行しますか？"
  );
}
