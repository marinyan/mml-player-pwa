import type { NoteEvent, Song } from "../mml/types";
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
    const voiceGains = calculateVoiceGains(events);
    this.scheduleAhead(song, events, voiceGains);
    this.timerId = window.setInterval(() => this.scheduleAhead(song, events, voiceGains), 60);
    this.tickTimerId = window.setInterval(() => this.reportPosition(song.durationSec), 100);
  }

  stop(nextStatus: PlaybackStatus = "stopped"): void {
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
    this.callbacks.onTick?.(0);
    this.setStatus(nextStatus);
  }

  rewind(): void {
    this.stop("idle");
  }

  getStatus(): PlaybackStatus {
    return this.status;
  }

  private scheduleAhead(song: Song, events: NoteEvent[], voiceGains: WeakMap<NoteEvent, number>): void {
    if (!this.audioContext || !this.synth) return;

    const horizonSec = 0.35;
    const playheadSec = this.audioContext.currentTime - this.startAudioTime;

    while (
      this.nextEventIndex < events.length &&
      events[this.nextEventIndex].startTimeSec <= playheadSec + horizonSec
    ) {
      const event = events[this.nextEventIndex];
      this.synth.schedule(event, this.startAudioTime + event.startTimeSec, song.patches, {
        voiceGain: voiceGains.get(event)
      });
      this.nextEventIndex += 1;
    }

    if (playheadSec >= song.durationSec + 0.05) {
      this.stop("ended");
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

function calculateVoiceGains(events: NoteEvent[]): WeakMap<NoteEvent, number> {
  const startCounts = new Map<number, number>();
  const audibleEvents = events.filter((event) => event.frequencyHz !== null && event.gateDurationSec > 0);
  for (const event of audibleEvents) {
    const key = startKey(event.startTimeSec);
    startCounts.set(key, (startCounts.get(key) ?? 0) + 1);
  }

  const gains = new WeakMap<NoteEvent, number>();
  for (const event of audibleEvents) {
    gains.set(event, 1 / Math.sqrt(startCounts.get(startKey(event.startTimeSec)) ?? 1));
  }
  return gains;
}

function startKey(timeSec: number): number {
  return Math.round(timeSec * 1_000_000);
}
