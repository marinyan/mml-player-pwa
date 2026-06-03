import { Scheduler, type PlaybackStatus } from "./audio/scheduler";
import { compileMml } from "./mml/compiler";
import { MmlError, type CompileResult } from "./mml/types";
import { loadSavedMml, saveMml } from "./storage/localStorage";

const defaultMml = "T120 O4 L8 V12 Q7\nC D E F G A B > C";

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <h1>MML Player</h1>
          <p>Offline PWA for iPhone Safari</p>
        </div>
        <span id="offlineBadge" class="badge">checking</span>
      </header>

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
  const playButton = getElement<HTMLButtonElement>("playButton");
  const stopButton = getElement<HTMLButtonElement>("stopButton");
  const rewindButton = getElement<HTMLButtonElement>("rewindButton");
  const tempoValue = getElement<HTMLElement>("tempoValue");
  const statusValue = getElement<HTMLElement>("statusValue");
  const positionValue = getElement<HTMLElement>("positionValue");
  const message = getElement<HTMLOutputElement>("message");
  const offlineBadge = getElement<HTMLElement>("offlineBadge");

  input.value = loadSavedMml(defaultMml);
  let compiled: CompileResult | null = null;

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

  const compileCurrent = (): CompileResult | null => {
    try {
      const next = compileMml(input.value);
      tempoValue.textContent = String(next.tempo);
      message.textContent = `${next.events.length} events, ${next.trackCount} track(s), ${next.durationSec.toFixed(1)}s`;
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

  playButton.addEventListener("click", () => {
    const next = compileCurrent();
    if (!next || next.events.length === 0) return;
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
