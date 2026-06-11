import { Scheduler, type PlaybackStatus } from "./audio/scheduler";
import { estimateWavBytes, renderSongToWav } from "./audio/wav";
import { defaultMml } from "./demo/defaultMml";
import { compileMml } from "./mml/compiler";
import { MmlError, type Song } from "./mml/types";
import { exportSongToSmf, gmTrackCount } from "./midi/smf";
import { createMmlTextBlob } from "./storage/fileText";
import { loadLastExportedMml, loadSavedMml, saveLastExportedMml, saveMml } from "./storage/localStorage";
import { requestExportFileName } from "./ui/exportFile";
import { createDebouncedTask } from "./ui/debouncedTask";
import { formatPosition } from "./ui/position";
import { confirmBeforeReplacingMml } from "./ui/replaceWarning";

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
              <button id="wavExportButton" type="button">Export WAV</button>
              <button id="midiExportButton" type="button">Export MIDI</button>
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
          <strong id="positionValue">0.0s / 0.0s</strong>
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
  const wavExportButton = getElement<HTMLButtonElement>("wavExportButton");
  const midiExportButton = getElement<HTMLButtonElement>("midiExportButton");
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
  let positionSec = 0;
  let lastExportedMml = loadLastExportedMml();

  const scheduler = new Scheduler({
    onStatusChange: (status) => {
      statusValue.textContent = statusLabel(status);
    },
    onTick: (nextPositionSec) => {
      positionSec = nextPositionSec;
      positionValue.textContent = formatPosition(positionSec, compiled?.durationSec ?? 0);
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
      message.textContent = compileMessage(next);
      message.classList.toggle("warning", next.master.diagnostics.length > 0);
      message.classList.remove("error");
      compiled = next;
      positionSec = Math.min(positionSec, next.durationSec);
      positionValue.textContent = formatPosition(positionSec, next.durationSec);
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
      message.classList.remove("warning");
      compiled = null;
      positionSec = 0;
      positionValue.textContent = formatPosition(0, 0);
      return null;
    }
  };

  const compileAfterInput = createDebouncedTask(compileCurrent, 150);
  const compileNow = (): Song | null => {
    compileAfterInput.cancel();
    return compileCurrent();
  };

  input.addEventListener("input", () => {
    saveMml(input.value);
    compileAfterInput.schedule();
  });

  loadDemoButton.addEventListener("click", () => {
    fileMenu.open = false;
    if (!confirmBeforeReplacingMml(input.value, lastExportedMml, window.confirm)) return;
    input.value = defaultMml;
    saveMml(input.value);
    compileNow();
    message.textContent = "Loaded demo song";
    message.classList.remove("error");
    message.classList.remove("warning");
  });

  importButton.addEventListener("click", () => {
    fileMenu.open = false;
    if (!confirmBeforeReplacingMml(input.value, lastExportedMml, window.confirm)) return;
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;

    void file.text().then((text) => {
      input.value = text;
      saveMml(text);
      compileNow();
      message.textContent = `Imported ${file.name}`;
      message.classList.remove("error");
      message.classList.remove("warning");
    }).catch((error: unknown) => {
      message.textContent = error instanceof Error ? error.message : "Import failed";
      message.classList.add("error");
    });
  });

  exportButton.addEventListener("click", () => {
    fileMenu.open = false;
    const fileName = requestExportFileName("mml-player.mml", ".mml", window.prompt);
    if (fileName === null) return;

    const blob = createMmlTextBlob(input.value);
    downloadBlob(blob, fileName);
    lastExportedMml = input.value;
    saveLastExportedMml(input.value);
    message.textContent = `Exported ${fileName}`;
    message.classList.remove("error");
    message.classList.remove("warning");
  });

  wavExportButton.addEventListener("click", () => {
    fileMenu.open = false;
    const song = compileNow();
    if (!song || eventCount(song) === 0) return;

    const fileName = requestExportFileName("mml-export.wav", ".wav", window.prompt);
    if (fileName === null) return;

    const estimatedBytes = estimateWavBytes(song);
    if (estimatedBytes === 0) {
      message.textContent = "WAV export requires at least one audible note";
      message.classList.add("error");
      message.classList.remove("warning");
      return;
    }
    if (estimatedBytes > 50 * 1024 * 1024 && !window.confirm(`Estimated WAV size is ${formatBytes(estimatedBytes)}. Continue?`)) {
      return;
    }

    wavExportButton.disabled = true;
    message.textContent = "Rendering WAV...";
    message.classList.remove("error");
    message.classList.remove("warning");

    void renderSongToWav(song)
      .then((blob) => {
        downloadBlob(blob, fileName);
        message.textContent = `Exported ${fileName} (${formatBytes(blob.size)})`;
        message.classList.remove("error");
        message.classList.remove("warning");
      })
      .catch((error: unknown) => {
        message.textContent = error instanceof Error ? error.message : "WAV export failed";
        message.classList.add("error");
        message.classList.remove("warning");
      })
      .finally(() => {
        wavExportButton.disabled = false;
      });
  });

  midiExportButton.addEventListener("click", () => {
    fileMenu.open = false;
    const song = compileNow();
    if (!song) return;
    if (gmTrackCount(song) === 0) {
      message.textContent = "MIDI export requires at least one @gm note";
      message.classList.add("error");
      message.classList.remove("warning");
      return;
    }

    const fileName = requestExportFileName("mml-export.mid", ".mid", window.prompt);
    if (fileName === null) return;

    try {
      const blob = exportSongToSmf(song);
      downloadBlob(blob, fileName);
      message.textContent = `Exported ${fileName} (${gmTrackCount(song)} GM track(s))`;
      message.classList.remove("error");
      message.classList.remove("warning");
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : "MIDI export failed";
      message.classList.add("error");
      message.classList.remove("warning");
    }
  });

  playButton.addEventListener("click", () => {
    const next = compileNow();
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
  compileNow();

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

function compileMessage(song: Song): string {
  const summary = `${eventCount(song)} events, ${song.tracks.length} track(s), ${song.durationSec.toFixed(1)}s`;
  if (song.master.diagnostics.length === 0) return summary;
  return `${summary}\nWARNING: ${song.master.diagnostics.map((diagnostic) => diagnostic.message).join(" / ")}`;
}

function displayTempo(song: Song): number {
  return song.master.tempoEvents.at(-1)?.tempo ?? 120;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
