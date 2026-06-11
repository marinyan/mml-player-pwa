import type { NoteEvent, Song } from "../mml/types";
import { calculateSongVoiceGain } from "./mix";
import { Synth } from "./synth";

export type PlaybackStatus = "idle" | "playing" | "stopped" | "ended";

export interface SchedulerCallbacks {
  onStatusChange?: (status: PlaybackStatus) => void;
  onTick?: (positionSec: number) => void;
}

export class Scheduler {
  private audioContext: AudioContext | null = null;
  private synth: Synth | null = null;
  private timerId: number | null = null;
  private tickTimerId: number | null = null;
  private startAudioTime = 0;
  private nextEventIndex = 0;
  private status: PlaybackStatus = "idle";

  constructor(private readonly callbacks: SchedulerCallbacks = {}) {}

  async play(song: Song): Promise<void> {
    this.stop("stopped");
    this.audioContext = new AudioContext();
    await this.audioContext.resume();
    this.synth = new Synth(this.audioContext);
    this.startAudioTime = this.audioContext.currentTime + 0.08;
    this.nextEventIndex = 0;
    this.setStatus("playing");
    const events = flattenSongEvents(song);
    const voiceGain = calculateSongVoiceGain(events);
    this.scheduleAhead(song, events, voiceGain);
    this.timerId = window.setInterval(() => this.scheduleAhead(song, events, voiceGain), 60);
    this.tickTimerId = window.setInterval(() => this.reportPosition(song.durationSec), 100);
  }

  stop(nextStatus: PlaybackStatus = "stopped", resetPosition = true): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.tickTimerId !== null) {
      window.clearInterval(this.tickTimerId);
      this.tickTimerId = null;
    }
    this.synth?.disconnect();
    this.synth = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.nextEventIndex = 0;
    if (resetPosition) {
      this.callbacks.onTick?.(0);
    }
    this.setStatus(nextStatus);
  }

  rewind(): void {
    this.stop("idle");
  }

  getStatus(): PlaybackStatus {
    return this.status;
  }

  private scheduleAhead(song: Song, events: NoteEvent[], voiceGain: number): void {
    if (!this.audioContext || !this.synth) return;

    const horizonSec = 0.35;
    const playheadSec = this.audioContext.currentTime - this.startAudioTime;

    while (
      this.nextEventIndex < events.length &&
      events[this.nextEventIndex].startTimeSec <= playheadSec + horizonSec
    ) {
      const event = events[this.nextEventIndex];
      this.synth.schedule(event, this.startAudioTime + event.startTimeSec, song.patches, {
        voiceGain
      });
      this.nextEventIndex += 1;
    }

    if (playheadSec >= song.durationSec + 0.05) {
      this.callbacks.onTick?.(song.durationSec);
      this.stop("ended", false);
    }
  }

  private reportPosition(durationSec: number): void {
    if (!this.audioContext) return;
    const positionSec = Math.min(Math.max(this.audioContext.currentTime - this.startAudioTime, 0), durationSec);
    this.callbacks.onTick?.(positionSec);
  }

  private setStatus(status: PlaybackStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }
}

function flattenSongEvents(song: Song): NoteEvent[] {
  return song.tracks
    .flatMap((track) => track.events)
    .sort((a, b) => a.startTimeSec - b.startTimeSec || a.trackIndex - b.trackIndex);
}
