// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// play, level-up, paused, game over and victory.
//
// ?seed=N fixes the run. ?shot=title|play|victory|gameover (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createWorld, EVENT_HIT, EVENT_LEVELUP, EVENT_OVER, EVENT_WAVE_CLEAR, EVENT_WIN, silentFx } from './world.js';
import {
  CARD_RECTS,
  SCREEN_LEVELUP,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
/** How long a wave banner stays on screen, in milliseconds. */
const BANNER_MS = 2400;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: scene.best, muted: audio.muted, banner: null, bannerAlpha: 0, mouse: null, choices: null }, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const fx = {
    onShoot: () => audio.shoot(),
    onHit: () => audio.hit(),
    onEnemyDie: (boss) => audio.enemyDie(),
    onPickup: () => audio.pickup(),
    onLevelUp: () => audio.levelup(),
    onHurt: () => audio.hurt(),
    onNova: () => audio.nova(),
    onWaveClear: () => audio.waveClear(),
    onBoss: () => {},
    onVictory: () => audio.victory(),
    onGameOver: () => audio.gameover(),
    onBossAttack: () => audio.hit(),
    onBossDash: () => audio.nova(),
    onBossTelegraph: () => audio.hit(),
    onEnemyShoot: () => {},
  };
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let choices = null;
  let banner = null;
  let bannerStart = 0;
  let lastWave = 0;
  let bossSeen = false;
  let lastDigits = new Set();
  world.reset();

  const ui = {
    get best() {
      return best;
    },
    get muted() {
      return audio.muted;
    },
    get banner() {
      return banner;
    },
    get bannerAlpha() {
      if (!banner) return 0;
      const age = performance.now() - bannerStart;
      if (age >= BANNER_MS) return 0;
      return age < 300 ? age / 300 : 1 - (age - 300) / (BANNER_MS - 300);
    },
    get mouse() {
      return input.mouse;
    },
    get choices() {
      return choices;
    },
  };

  function announce(message) {
    status.textContent = message;
  }

  function showBanner(text) {
    banner = text;
    bannerStart = performance.now();
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    lastWave = 0;
    bossSeen = false;
    banner = null;
    choices = null;
    screen = SCREEN_PLAY;
    audio.ensure();
    audio.startMusic();
    announce('Playing. Survive nine waves and face the Hollow King.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Victory. Score ${world.state.score}.` : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function openLevelUp() {
    choices = world.offerChoices();
    if (choices) {
      screen = SCREEN_LEVELUP;
      announce(`Level ${world.state.player.level}. Choose a boon.`);
    }
  }

  /** A digit key (1, 2 or 3) pressed fresh this frame, or 0. */
  function freshDigit() {
    const now = new Set();
    for (let d = 1; d <= 3; d += 1) {
      if (input.digitPressed(d)) now.add(d);
    }
    let pressed = 0;
    for (const d of now) {
      if (!lastDigits.has(d)) pressed = d;
    }
    lastDigits = now;
    return pressed;
  }

  function handleLevelUpInput() {
    const digit = freshDigit();
    let picked = null;
    if (digit >= 1 && digit <= choices.length) picked = choices[digit - 1].id;
    const click = input.takeClick();
    if (click) {
      choices.forEach((choice, i) => {
        const rect = CARD_RECTS[i];
        if (click.x >= rect.x && click.x <= rect.x + rect.w && click.y >= rect.y && click.y <= rect.y + rect.h) {
          picked = choice.id;
        }
      });
    }
    if (!picked) return;
    audio.click();
    world.chooseBoon(picked);
    if (world.state.player.pendingLevels > 0) {
      choices = world.offerChoices();
    } else {
      choices = null;
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.ensure();
      audio.toggleMute();
    }
    if (screen === SCREEN_LEVELUP) return;
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      const click = input.takeClick();
      if (click) startGame();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, silentFx);
      // The title's field never ends: refresh it when it goes quiet or dies.
      if (world.state.over || world.state.time > 40) world.reset();
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, input.direction(), fx);
    const state = world.state;
    if (state.wave !== lastWave && state.wave > 0) {
      lastWave = state.wave;
      showBanner(state.boss ? `WAVE ${state.wave} — ${state.boss.name.toUpperCase()}` : `WAVE ${state.wave}`);
    }
    if (state.boss && !bossSeen) {
      bossSeen = true;
      audio.roar();
    }
    if (!state.boss) bossSeen = false;
    if (events & EVENT_HIT) announce(`Hit. ${Math.max(0, Math.ceil(state.player.hp))} health left.`);
    if (events & EVENT_WAVE_CLEAR) announce(`Wave ${state.wave} cleared.`);
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
    else if (events & EVENT_LEVELUP) openLevelUp();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_LEVELUP) handleLevelUpInput();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(world.state, screen, ui, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting foes close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberwarden. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
