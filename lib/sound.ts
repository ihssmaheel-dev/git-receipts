export type PrinterSoundEvent = "warm" | "handshake" | "line" | "feed" | "cut" | "done";

export interface PrinterSound {
  setMuted: (muted: boolean) => void;
  resume: () => void;
  play: (event: PrinterSoundEvent) => void;
  stop: () => void;
  close: () => void;
}

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Call during a user gesture; audio never starts from a React effect. */
export function createPrinterSound(muted = true): PrinterSound | null {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!Context) return null;

  let context: AudioContext;
  try {
    context = new Context();
  } catch {
    return null;
  }

  let silent = muted;
  let closed = false;
  const sources = new Set<AudioScheduledSourceNode>();
  const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.2), context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }

  const stop = () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // A source may have completed before its ended event was delivered.
      }
      source.disconnect();
    }
    sources.clear();
  };

  const resume = () => {
    if (!closed && context.state === "suspended") {
      // Some browsers reject resume when audio is unavailable; printing still works.
      void context.resume().catch(() => undefined);
    }
  };

  const tone = (frequency: number, duration: number, volume: number, offset = 0) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + offset;
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * 0.68), start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    sources.add(oscillator);
    oscillator.onended = () => {
      sources.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  };

  const motor = (duration: number, volume: number) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime;
    source.buffer = noise;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 430;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.setValueAtTime(volume, start + Math.max(0.01, duration - 0.02));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(start);
    source.stop(start + duration + 0.01);
  };

  const play = (event: PrinterSoundEvent) => {
    if (silent || closed || context.state !== "running") return;
    try {
      switch (event) {
        case "warm":
          motor(0.26, 0.012);
          tone(72, 0.24, 0.005);
          break;
        case "handshake":
          tone(180, 0.08, 0.005);
          break;
        case "line":
        case "feed":
          motor(0.048, 0.01);
          tone(128, 0.042, 0.004);
          break;
        case "cut":
          motor(0.19, 0.018);
          tone(82, 0.16, 0.01);
          tone(260, 0.028, 0.004, 0.12);
          break;
        case "done":
          tone(165, 0.045, 0.003);
          break;
      }
    } catch {
      // Audio is decorative and must never interrupt receipt generation.
    }
  };

  resume();
  return {
    setMuted: (value) => {
      silent = value;
      if (silent) stop();
      else resume();
    },
    resume,
    play,
    stop,
    close: () => {
      if (closed) return;
      closed = true;
      stop();
      void context.close().catch(() => undefined);
    },
  };
}
