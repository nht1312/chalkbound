import type { ScratchLevel } from './chalkScratch';

/**
 * The chalk scratch, synthesized (plan T8: no asset files).
 *
 * Filtered white noise through a bandpass, which is what a scratch is: broad
 * noise with a resonant peak set by how hard the stick is pressed. Playback
 * rate shifts the grain, so moving faster both raises the pitch and speeds up
 * the texture, the way a real stick does.
 *
 * Nothing is created until the first audible frame. Browsers refuse to start
 * an AudioContext before a user gesture, and building one at load just to
 * leave it suspended earns a console warning on every page open.
 */
export interface ScratchVoiceConfig {
  /** Centre of the resonant peak, Hz. */
  readonly centreHz: number;
  /** Bandpass Q: higher is more "squeak", lower is more "hiss". */
  readonly q: number;
  /** Everything above this is hiss rather than chalk. */
  readonly lowpassHz: number;
  /** Seconds of noise in the loop. Long enough not to sound periodic. */
  readonly loopSeconds: number;
}

export interface ScratchVoice {
  /** Applies the current level. Silent levels cost nothing. */
  set(level: ScratchLevel): void;
  dispose(): void;
}

interface Graph {
  readonly context: AudioContext;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

export function createScratchVoice(config: ScratchVoiceConfig): ScratchVoice {
  let graph: Graph | undefined;
  let failed = false;

  const ensure = (): Graph | undefined => {
    if (graph || failed) return graph;
    try {
      graph = build(config);
    } catch {
      // No Web Audio, or the browser refused: the game is still playable in
      // silence, so this must never throw into the frame loop.
      failed = true;
    }
    return graph;
  };

  return {
    set(level) {
      // Stay unbuilt until there is something to hear.
      if (!graph && level.gain <= 0) return;
      const active = ensure();
      if (!active) return;
      if (active.context.state === 'suspended') void active.context.resume().catch(() => {});
      const now = active.context.currentTime;
      // setTargetAtTime, not a bare assignment: stepping gain per frame
      // turns a scratch into a buzz.
      active.gain.gain.setTargetAtTime(level.gain, now, 0.02);
      active.source.playbackRate.setTargetAtTime(level.rate, now, 0.02);
    },
    dispose() {
      if (!graph) return;
      const { context, source } = graph;
      graph = undefined;
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      void context.close().catch(() => {});
    },
  };
}

function build(config: ScratchVoiceConfig): Graph {
  const context = new AudioContext();
  const length = Math.max(1, Math.floor(context.sampleRate * config.loopSeconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  // Plain white noise. The filters below are what make it chalk.
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = config.centreHz;
  band.Q.value = config.q;

  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = config.lowpassHz;

  const gain = context.createGain();
  gain.gain.value = 0;

  source.connect(band).connect(lowpass).connect(gain).connect(context.destination);
  source.start();
  return { context, source, gain };
}
