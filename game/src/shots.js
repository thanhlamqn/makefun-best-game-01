// The screenshot scenes behind ?shot=title|play|victory|gameover. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by an autopilot, so the frame is what a real game looks
// like and the same seed always gives the same frame. The victory scene
// plays a hero's build to a real win; the game-over scene plays carelessly
// until the light goes out.
import { STEP } from './config.js';
import { EVENT_LEVELUP, EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const SAMPLE = STEP;
const TITLE_SECONDS = 5;
const PLAY_SECONDS = 16;
const RUN_LIMIT_SECONDS = 360;
const END_LIMIT_SECONDS = 240;

/**
 * Steer the warden: flee what is close, gather the nearest shard, and keep
 * off the walls. `careless` chases shards and never dodges, as a hurried
 * player does.
 */
function autopilot(state, careless) {
  const player = state.player;
  let fx = 0;
  let fy = 0;
  if (!careless) {
    // Flee everything close, harder the nearer it is; bosses push hardest.
    for (const enemy of state.enemies) {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 170 * 170 || d2 === 0) continue;
      const dist = Math.sqrt(d2);
      const weight = (enemy.isBoss ? 2.6 : 1.4) * (1 - dist / 170);
      fx += (dx / dist) * weight;
      fy += (dy / dist) * weight;
    }
  }
  let shard = null;
  let shardD2 = Infinity;
  for (const s of state.shards) {
    const dx = s.x - player.x;
    const dy = s.y - player.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < shardD2) {
      shardD2 = d2;
      shard = s;
    }
  }
  if (shard && shardD2 < 340 * 340) {
    const dist = Math.sqrt(shardD2) || 1;
    // Shards wait: only chase them when nothing is breathing down the
    // warden's neck.
    let danger = false;
    for (const enemy of state.enemies) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      if (dx * dx + dy * dy < 120 * 120) {
        danger = true;
        break;
      }
    }
    if (!danger) {
      fx += ((shard.x - player.x) / dist) * 1.1;
      fy += ((shard.y - player.y) / dist) * 1.1;
    }
  }
  if (fx === 0 && fy === 0) {
    fx = (640 - player.x) / 640;
    fy = (360 - player.y) / 360;
  }
  // Keep off the walls, so the fight stays framed in the middle of the field.
  if (!careless) {
    if (player.x < 150) fx += 0.9;
    if (player.x > 1130) fx -= 0.9;
    if (player.y < 130) fy += 0.9;
    if (player.y > 590) fy -= 0.9;
  }
  const len = Math.hypot(fx, fy) || 1;
  return { x: fx / len, y: fy / len };
}

/** Spend every pending level on the first card on offer. */
function spendLevels(world) {
  const state = world.state;
  while (state.player.pendingLevels > 0) {
    const choices = world.offerChoices();
    if (!choices || choices.length === 0) break;
    world.chooseBoon(choices[0].id);
  }
}

/** Play forward until `stop` says so, or the step cap, steering as told. */
function playForward(world, seconds, careless, stop) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(SAMPLE, autopilot(world.state, careless), {
      onShoot() {},
      onHit() {},
      onEnemyDie() {},
      onPickup() {},
      onLevelUp() {},
      onHurt() {},
      onNova() {},
      onWaveClear() {},
      onBoss() {},
      onVictory() {},
      onGameOver() {},
      onBossAttack() {},
      onBossDash() {},
      onBossTelegraph() {},
      onEnemyShoot() {},
    });
    if (events & EVENT_LEVELUP) spendLevels(world);
    if (stop && stop(events, world.state)) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Any unknown name is the title.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    // A mid-run boss fight: wave 6, the Hollow Matriarch, with a few boons
    // already earned, so the frame is thick with foes and fire.
    const player = world.state.player;
    world.startWave(6);
    for (const id of ['volley', 'might', 'swift', 'aura', 'halo', 'nova']) {
      player.pendingLevels = 1;
      world.chooseBoon(id);
    }
    playForward(world, PLAY_SECONDS, false, (events) => (events & EVENT_OVER) !== 0);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'victory') {
    // A hero's run, played to the real win.
    world.heroBuild();
    playForward(world, RUN_LIMIT_SECONDS, false, (events) => (events & EVENT_WIN) !== 0 || (events & EVENT_OVER) !== 0);
    if (!world.state.won) {
      // The run should win; if the pilot fell short, say so plainly in the
      // report instead of faking a victory screen.
      throw new Error(`victory scene: hero run ended ${world.state.over ? 'dead' : 'unfinished'} at wave ${world.state.wave}`);
    }
    return { screen: SCREEN_WIN, best: world.state.score };
  }
  if (name === 'gameover') {
    playForward(world, END_LIMIT_SECONDS, true, (events) => (events & EVENT_OVER) !== 0);
    if (!world.state.over) {
      throw new Error(`gameover scene: careless run survived to wave ${world.state.wave} without dying`);
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  for (let i = 0; i < TITLE_SECONDS / SAMPLE; i += 1) {
    world.step(SAMPLE, { x: 0, y: 0 }, {
      onShoot() {},
      onHit() {},
      onEnemyDie() {},
      onPickup() {},
      onLevelUp() {},
      onHurt() {},
      onNova() {},
      onWaveClear() {},
      onBoss() {},
      onVictory() {},
      onGameOver() {},
      onBossAttack() {},
      onBossDash() {},
      onBossTelegraph() {},
      onEnemyShoot() {},
    });
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
