// Emberwarden: tuning for the whole game. One place, every number the game
// balances on, so a tweak here is a tweak everywhere.
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const BEST_KEY = 'emberwarden.best';
export const MUTE_KEY = 'emberwarden.muted';

/** How many waves a run lasts; the wave-9 boss is the win. */
export const FINAL_WAVE = 9;
/** Seconds of calm between one wave's last kill and the next wave's first spawn. */
export const BREATHER_SECONDS = 4;
/** Enemies alive at once, at most: keeps the frame calm and the fight fair. */
export const MAX_ALIVE = 42;

export const PLAYER = {
  radius: 16,
  speed: 235,
  maxHp: 100,
  /** Seconds between ember-bolt volleys at the start. */
  fireInterval: 0.46,
  boltSpeed: 560,
  boltDamage: 11,
  boltRadius: 5,
  /** Enemies are shot at only inside this range. */
  aimRange: 460,
  /** Shards drift to the player inside this radius. */
  magnetRadius: 90,
  /** Shards are collected inside this radius. */
  collectRadius: 26,
  /** Contact damage ticks at most this often per enemy. */
  contactCooldown: 0.55,
};

/** XP a level costs: level n needs 6 + 7n shards (level 1 needs 13). */
export function xpForLevel(level) {
  return 6 + 7 * level;
}

/** What one wave is made of: how many foes, how fast they arrive, how tough. */
export function wavePlan(wave) {
  const quota = 8 + 6 * wave;
  const interval = Math.max(0.32, 1.05 - wave * 0.07);
  const hpScale = 1 + (wave - 1) * 0.22;
  const speedScale = 1 + Math.min(0.35, (wave - 1) * 0.04);
  // Composition shifts as the run goes on: wisps from wave 2, spitters from
  // wave 3, brutes from wave 4; every third wave ends with a boss.
  const mix = { cinder: 1, wisp: 0, spitter: 0, brute: 0 };
  if (wave >= 2) mix.wisp = 0.25;
  if (wave >= 3) mix.spitter = 0.16;
  if (wave >= 4) mix.brute = 0.12;
  const total = mix.cinder + mix.wisp + mix.spitter + mix.brute;
  for (const key of Object.keys(mix)) mix[key] /= total;
  return { quota, interval, hpScale, speedScale, mix, boss: wave % 3 === 0 };
}

/** Points for a kill, by foe kind. */
export const SCORE = { cinder: 10, wisp: 15, spitter: 20, brute: 35, boss: 500 };
