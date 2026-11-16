// Every sound in the game is made here, with the Web Audio API and nothing
// else: short oscillator blips for shots and hits, filtered noise for the
// nova, and a quiet two-voice loop (a low drone under a slow pentatonic
// pluck) for music. No audio files are shipped, so the game stays silent
// until the player first interacts, as browsers require.
import { MUTE_KEY } from './config.js';

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** A tiny pentatonic line the music walks, in hertz (A minor pentatonic). */
const MELODY = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 392, 329.63, 293.66];
const DRONE = 55;

export function createAudio() {
  let context = null;
  let master = null;
  let musicTimer = null;
  let melodyStep = 0;
  let muted = readMuted();

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return true;
    }
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  /** One oscillator note with an exponential decay. */
  function tone(freq, seconds, type, volume, slideTo) {
    if (!context || muted) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + seconds);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  }

  /** A burst of filtered noise, for impacts and the nova. */
  function noise(seconds, volume, cutoff) {
    if (!context || muted) return;
    const now = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
  }

  function startMusic() {
    if (!ensure() || musicTimer !== null) return;
    // The drone holds the room; the melody steps once a bar.
    const droneOsc = context.createOscillator();
    const droneGain = context.createGain();
    droneOsc.type = 'sine';
    droneOsc.frequency.value = DRONE;
    droneGain.gain.value = 0.05;
    droneOsc.connect(droneGain);
    droneGain.connect(master);
    droneOsc.start();
    const fifth = context.createOscillator();
    const fifthGain = context.createGain();
    fifth.type = 'sine';
    fifth.frequency.value = DRONE * 1.5;
    fifthGain.gain.value = 0.03;
    fifth.connect(fifthGain);
    fifthGain.connect(master);
    fifth.start();
    musicTimer = window.setInterval(() => {
      if (muted) return;
      const note = MELODY[melodyStep % MELODY.length];
      melodyStep += 1;
      tone(note, 1.6, 'triangle', 0.055);
      if (melodyStep % 4 === 0) tone(note / 2, 2.2, 'sine', 0.05);
    }, 620);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    get muted() {
      return muted;
    },
    ensure,
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Storage can be off: the mute then lasts this visit only.
      }
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    startMusic,
    stopMusic,
    click() {
      tone(660, 0.07, 'square', 0.08);
    },
    shoot() {
      tone(880, 0.09, 'square', 0.045, 440);
    },
    hit() {
      tone(190, 0.06, 'triangle', 0.06, 120);
    },
    enemyDie() {
      tone(320, 0.16, 'sawtooth', 0.07, 70);
      noise(0.12, 0.05, 900);
    },
    pickup() {
      tone(1046, 0.08, 'sine', 0.06, 1568);
    },
    levelup() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        window.setTimeout(() => tone(freq, 0.22, 'triangle', 0.09), i * 70);
      });
    },
    hurt() {
      tone(140, 0.22, 'sawtooth', 0.12, 60);
      noise(0.18, 0.09, 500);
    },
    nova() {
      noise(0.5, 0.16, 1600);
      tone(220, 0.5, 'sine', 0.1, 40);
    },
    roar() {
      tone(90, 0.7, 'sawtooth', 0.14, 45);
      noise(0.6, 0.1, 300);
    },
    waveClear() {
      [392, 523.25, 659.25].forEach((freq, i) => {
        window.setTimeout(() => tone(freq, 0.18, 'triangle', 0.08), i * 80);
      });
    },
    victory() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
        window.setTimeout(() => tone(freq, 0.4, 'triangle', 0.1), i * 110);
      });
    },
    gameover() {
      [392, 329.63, 261.63, 196].forEach((freq, i) => {
        window.setTimeout(() => tone(freq, 0.4, 'sine', 0.09), i * 140);
      });
    },
  };
}
