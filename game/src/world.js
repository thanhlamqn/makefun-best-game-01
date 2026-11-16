// The world: the rules, the waves, the collisions and the score. The
// renderer paints this state and the main loop feeds it input; nothing here
// touches the screen or the keyboard. A step is a fixed 1/60 s, so a run
// replays the same from the same seed.
import {
  BREATHER_SECONDS,
  FINAL_WAVE,
  MAX_ALIVE,
  PLAYER,
  SCORE,
  VIEW,
  wavePlan,
} from './config.js';
import {
  KIND_BOSS,
  KIND_BRUTE,
  KIND_CINDER,
  KIND_WISP,
  bossSpiralStep,
  createEnemy,
  updateEnemy,
} from './enemies.js';
import { applyBoon, applyMend, createPlayer, gainXp, levelUpChoices } from './player.js';
import { createParticles } from './particles.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WIN = 4;
export const EVENT_LEVELUP = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_BOSS = 32;

/** Sounds and shakes the world asks for; the main loop wires them to audio. */
export const silentFx = {
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
};

function edgePoint(random) {
  const side = random.int(4);
  const m = 30;
  if (side === 0) return { x: random.range(0, VIEW.width), y: -m };
  if (side === 1) return { x: VIEW.width + m, y: random.range(0, VIEW.height) };
  if (side === 2) return { x: random.range(0, VIEW.width), y: VIEW.height + m };
  return { x: -m, y: random.range(0, VIEW.height) };
}

function pickKind(mix, random) {
  const roll = random.next();
  let acc = 0;
  for (const [kind, weight] of Object.entries(mix)) {
    acc += weight;
    if (roll <= acc) return kind;
  }
  return KIND_CINDER;
}

export function createWorld(random) {
  const particles = createParticles();
  let state = null;

  function reset() {
    state = {
      time: 0,
      score: 0,
      kills: 0,
      wave: 0,
      waveState: 'breather',
      breatherTimer: 1.4,
      spawnQueue: [],
      spawnTimer: 0,
      spawnInterval: 1,
      player: createPlayer(),
      enemies: [],
      bolts: [],
      enemyShots: [],
      shards: [],
      pickups: [],
      boss: null,
      particles,
      over: false,
      won: false,
      /** Red flash over the frame after a hit. */
      hurtFlash: 0,
      /** Brief freeze after a boss dies. */
      hitStop: 0,
      /** The boon cards on offer right now, if any. */
      choices: null,
    };
    return state;
  }

  function startWave(wave) {
    const plan = wavePlan(wave);
    state.wave = wave;
    state.waveState = 'fight';
    state.spawnInterval = plan.interval;
    state.spawnTimer = 0.4;
    state.spawnQueue = [];
    for (let i = 0; i < plan.quota; i += 1) state.spawnQueue.push(pickKind(plan.mix, random));
    state.plan = plan;
    if (plan.boss) {
      const point = edgePoint(random);
      const boss = createEnemy(KIND_BOSS, point.x, point.y, wave, plan.hpScale, plan.speedScale, random);
      state.enemies.push(boss);
      state.boss = boss;
    }
  }

  function spawnOne() {
    if (state.enemies.length >= MAX_ALIVE) return;
    const kind = state.spawnQueue.shift();
    if (!kind) return;
    const point = edgePoint(random);
    const plan = state.plan;
    state.enemies.push(createEnemy(kind, point.x, point.y, state.wave, plan.hpScale, plan.speedScale, random));
  }

  function damageEnemy(enemy, amount, fx, crit) {
    enemy.hp -= amount;
    enemy.hitFlash = 0.12;
    if (crit) particles.text(enemy.x, enemy.y - enemy.radius - 6, Math.round(amount), '#ffd76a');
    if (enemy.hp > 0) return;
    enemy.dead = true;
    state.kills += 1;
    state.score += enemy.score;
    particles.burst(enemy.x, enemy.y, { count: enemy.isBoss ? 46 : 12, color: enemy.glow, speed: 240 });
    particles.burst(enemy.x, enemy.y, { count: 8, color: '#ffb347', speed: 140 });
    fx.onEnemyDie(enemy.isBoss);
    // Shards: one per xp, scattered; bosses drop a feast and a heart.
    const shards = enemy.isBoss ? 10 : enemy.xp;
    for (let i = 0; i < shards; i += 1) {
      const a = random.range(0, Math.PI * 2);
      state.shards.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(a) * random.range(30, 90),
        vy: Math.sin(a) * random.range(30, 90),
        value: 1,
      });
    }
    if (enemy.isBoss || random.next() < 0.04) {
      state.pickups.push({ kind: 'heart', x: enemy.x, y: enemy.y, vx: 0, vy: 0 });
    }
    if (!enemy.isBoss && random.next() < 0.02) {
      state.pickups.push({ kind: 'nova', x: enemy.x, y: enemy.y, vx: 0, vy: 0 });
    }
    if (enemy.isBoss) {
      particles.ring(enemy.x, enemy.y, '#ffd76a', 26);
      particles.shake(0.7);
      state.hitStop = 0.35;
      state.boss = null;
      if (state.wave >= FINAL_WAVE) {
        state.won = true;
        fx.onVictory();
      }
    }
  }

  function fireBolts(player, fx) {
    let target = null;
    let best = PLAYER.aimRange * PLAYER.aimRange;
    for (const enemy of state.enemies) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        target = enemy;
      }
    }
    if (!target) return;
    const base = Math.atan2(target.y - player.y, target.x - player.x);
    const spread = 0.14;
    for (let i = 0; i < player.bolts; i += 1) {
      const offset = (i - (player.bolts - 1) / 2) * spread;
      const angle = base + offset;
      state.bolts.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * player.boltSpeed,
        vy: Math.sin(angle) * player.boltSpeed,
        r: PLAYER.boltRadius,
        damage: player.damage,
        life: 1.1,
      });
    }
    particles.burst(player.x, player.y, { count: 3, color: '#ffcf7a', speed: 90, life: 0.25, size: 2 });
    fx.onShoot();
  }

  function novaBlast(player, fx) {
    const radius = 230;
    particles.ring(player.x, player.y, '#ff9a3c', 30);
    particles.burst(player.x, player.y, { count: 26, color: '#ffcf7a', speed: 320, life: 0.5 });
    particles.shake(0.35);
    for (const enemy of state.enemies) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius + enemy.radius) continue;
      const push = 260 * (1 - dist / (radius + enemy.radius));
      if (!enemy.isBoss && dist > 1) {
        enemy.x += (dx / dist) * push * 0.12;
        enemy.y += (dy / dist) * push * 0.12;
      }
      damageEnemy(enemy, player.novaDamage, fx, false);
    }
    fx.onNova();
  }

  function step(dt, move, fx) {
    if (state.over || state.won) return 0;
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      state.particles.update(dt);
      return 0;
    }
    let events = 0;
    const player = state.player;
    state.time += dt;
    state.hurtFlash = Math.max(0, state.hurtFlash - dt * 2.2);
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);

    // --- the player moves ---
    player.x = Math.max(player.radius, Math.min(VIEW.width - player.radius, player.x + move.x * player.speed * dt));
    player.y = Math.max(player.radius, Math.min(VIEW.height - player.radius, player.y + move.y * player.speed * dt));
    if (move.x !== 0) player.facing = move.x > 0 ? 1 : -1;
    if (move.x !== 0 || move.y !== 0) player.walkPhase += dt * 11;

    // --- the lantern fires on its own ---
    player.fireTimer -= dt;
    if (player.fireTimer <= 0) {
      fireBolts(player, fx);
      player.fireTimer = player.fireInterval;
    }

    // --- orbiting embers ---
    player.orbiterAngle += dt * 3.2;
    if (player.orbiters > 0) {
      for (let i = 0; i < player.orbiters; i += 1) {
        const a = player.orbiterAngle + (i / player.orbiters) * Math.PI * 2;
        const ox = player.x + Math.cos(a) * 62;
        const oy = player.y + Math.sin(a) * 62;
        for (const enemy of state.enemies) {
          enemy.orbiterTimer = Math.max(0, (enemy.orbiterTimer ?? 0) - dt);
          if (enemy.orbiterTimer > 0) continue;
          const dx = enemy.x - ox;
          const dy = enemy.y - oy;
          if (dx * dx + dy * dy < (enemy.radius + 12) * (enemy.radius + 12)) {
            enemy.orbiterTimer = 0.5;
            damageEnemy(enemy, 14 + player.novaLevel * 3, fx, false);
          }
        }
      }
    }

    // --- the burning aura ---
    if (player.auraDps > 0) {
      for (const enemy of state.enemies) {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        if (dx * dx + dy * dy < (player.auraRadius + enemy.radius) * (player.auraRadius + enemy.radius)) {
          enemy.hp -= player.auraDps * dt;
          if (enemy.hp <= 0) damageEnemy(enemy, 0, fx, false);
        }
      }
    }

    // --- the nova bloom ---
    if (player.novaLevel > 0) {
      player.novaTimer -= dt;
      if (player.novaTimer <= 0) {
        novaBlast(player, fx);
        player.novaTimer = 6;
      }
    }

    // --- bolts fly and land ---
    for (let i = state.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = state.bolts[i];
      bolt.life -= dt;
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      let spent = bolt.life <= 0 || bolt.x < -20 || bolt.x > VIEW.width + 20 || bolt.y < -20 || bolt.y > VIEW.height + 20;
      if (!spent) {
        for (const enemy of state.enemies) {
          const dx = enemy.x - bolt.x;
          const dy = enemy.y - bolt.y;
          const rr = enemy.radius + bolt.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          const crit = random.next() < player.crit;
          const amount = bolt.damage * (crit ? 2 : 1);
          if (!enemy.isBoss) {
            const dist = Math.hypot(dx, dy) || 1;
            enemy.x -= (dx / dist) * 7;
            enemy.y -= (dy / dist) * 7;
          }
          damageEnemy(enemy, amount, fx, crit);
          particles.burst(bolt.x, bolt.y, { count: 4, color: '#ffcf7a', speed: 120, life: 0.3, size: 2 });
          fx.onHit();
          spent = true;
          break;
        }
      }
      if (spent) state.bolts.splice(i, 1);
    }

    // --- foes move, shoot and touch ---
    const hooks = {
      spawnEnemyShot(x, y, vx, vy, damage) {
        state.enemyShots.push({ x, y, vx, vy, r: 6, damage, life: 6 });
      },
      summonMinions(boss, kind, count) {
        for (let i = 0; i < count; i += 1) {
          if (state.enemies.length >= MAX_ALIVE) break;
          const a = random.range(0, Math.PI * 2);
          const minion = createEnemy(
            kind,
            boss.x + Math.cos(a) * 70,
            boss.y + Math.sin(a) * 70,
            state.wave,
            state.plan.hpScale,
            state.plan.speedScale,
            random,
          );
          state.enemies.push(minion);
        }
        particles.burst(boss.x, boss.y, { count: 20, color: '#b7a6ff', speed: 200 });
      },
      onEnemyShoot: () => fx.onEnemyShoot(),
      onBossAttack: () => fx.onBossAttack(),
      onBossDash: () => fx.onBossDash(),
      onBossTelegraph: () => fx.onBossTelegraph(),
    };
    for (const enemy of state.enemies) {
      if (enemy.isBoss && enemy.wave === 6 && enemy.burstLeft > 0) {
        enemy.spiralTimer = (enemy.spiralTimer ?? 0) - dt;
        if (enemy.spiralTimer <= 0) {
          bossSpiralStep(enemy, dt, hooks);
          enemy.spiralTimer = 0.16;
        }
      }
      updateEnemy(enemy, player, dt, hooks);
      // Touching the warden hurts.
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const rr = enemy.radius + player.radius - 2;
      if (dx * dx + dy * dy < rr * rr && enemy.contactTimer <= 0 && player.hurtTimer <= 0) {
        enemy.contactTimer = PLAYER.contactCooldown;
        player.hurtTimer = 0.6;
        player.hp -= enemy.damage;
        state.hurtFlash = 1;
        particles.shake(0.45);
        particles.burst(player.x, player.y, { count: 14, color: '#ff5a3c', speed: 220 });
        fx.onHurt();
        events |= EVENT_HIT;
        if (player.hp <= 0) {
          player.hp = 0;
          state.over = true;
          particles.burst(player.x, player.y, { count: 40, color: '#ffcf7a', speed: 300 });
          particles.shake(0.9);
          fx.onGameOver();
          events |= EVENT_OVER;
        }
      }
    }

    // --- foes keep their distance from each other ---
    const foes = state.enemies;
    for (let i = 0; i < foes.length; i += 1) {
      for (let j = i + 1; j < foes.length; j += 1) {
        const a = foes[i];
        const b = foes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.radius + b.radius - 4;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const dist = Math.sqrt(d2);
        const push = (rr - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        const aWeight = a.isBoss ? 0.1 : 1;
        const bWeight = b.isBoss ? 0.1 : 1;
        a.x -= nx * push * aWeight;
        a.y -= ny * push * aWeight;
        b.x += nx * push * bWeight;
        b.y += ny * push * bWeight;
      }
    }

    // --- the dead are cleared ---
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      if (state.enemies[i].dead) state.enemies.splice(i, 1);
    }

    // --- enemy shots fly ---
    for (let i = state.enemyShots.length - 1; i >= 0; i -= 1) {
      const shot = state.enemyShots[i];
      shot.life -= dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      let spent = shot.life <= 0 || shot.x < -20 || shot.x > VIEW.width + 20 || shot.y < -20 || shot.y > VIEW.height + 20;
      if (!spent && player.hurtTimer <= 0) {
        const dx = player.x - shot.x;
        const dy = player.y - shot.y;
        const rr = player.radius + shot.r;
        if (dx * dx + dy * dy < rr * rr) {
          player.hp -= shot.damage;
          player.hurtTimer = 0.6;
          state.hurtFlash = 1;
          particles.shake(0.4);
          fx.onHurt();
          events |= EVENT_HIT;
          spent = true;
          if (player.hp <= 0) {
            player.hp = 0;
            state.over = true;
            fx.onGameOver();
            events |= EVENT_OVER;
          }
        }
      }
      if (spent) state.enemyShots.splice(i, 1);
    }

    // --- shards drift, magnetise and feed the lantern ---
    for (let i = state.shards.length - 1; i >= 0; i -= 1) {
      const shard = state.shards[i];
      const dx = player.x - shard.x;
      const dy = player.y - shard.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < player.magnetRadius) {
        const pull = 620 * (1 - dist / (player.magnetRadius + 60));
        shard.vx += (dx / dist) * pull * dt * 8;
        shard.vy += (dy / dist) * pull * dt * 8;
      } else {
        shard.vx *= 1 - 2 * dt;
        shard.vy *= 1 - 2 * dt;
      }
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (dist < PLAYER.collectRadius) {
        state.shards.splice(i, 1);
        const gained = gainXp(player, shard.value);
        if (gained > 0) {
          player.pendingLevels += gained;
          events |= EVENT_LEVELUP;
          fx.onLevelUp();
        } else {
          fx.onPickup();
        }
      }
    }

    // --- hearts and nova bombs ---
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < player.magnetRadius) {
        pickup.vx += (dx / dist) * 500 * dt * 8;
        pickup.vy += (dy / dist) * 500 * dt * 8;
      }
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      pickup.vx *= 1 - 2 * dt;
      pickup.vy *= 1 - 2 * dt;
      if (dist < PLAYER.collectRadius + 6) {
        state.pickups.splice(i, 1);
        if (pickup.kind === 'heart') {
          player.hp = Math.min(player.maxHp, player.hp + 18);
          particles.text(player.x, player.y - 26, '+18', '#7dff8a');
          fx.onPickup();
        } else {
          for (const enemy of state.enemies) damageEnemy(enemy, 60, fx, false);
          state.enemyShots.length = 0;
          particles.ring(player.x, player.y, '#ffd76a', 34);
          particles.shake(0.6);
          fx.onNova();
        }
      }
    }

    // --- waves roll on ---
    if (state.waveState === 'breather') {
      state.breatherTimer -= dt;
      if (state.breatherTimer <= 0) startWave(state.wave + 1);
    } else {
      state.spawnTimer -= dt;
      if (state.spawnQueue.length > 0 && state.spawnTimer <= 0) {
        spawnOne();
        if (state.wave >= 5) spawnOne();
        state.spawnTimer = state.spawnInterval;
      }
      if (state.spawnQueue.length === 0 && state.enemies.length === 0 && !state.boss) {
        state.score += 100 * state.wave;
        state.waveState = 'breather';
        state.breatherTimer = BREATHER_SECONDS;
        events |= EVENT_WAVE_CLEAR;
        fx.onWaveClear();
      }
      if (state.boss) events |= EVENT_BOSS;
    }

    if (state.won) events |= EVENT_WIN;
    state.particles.update(dt);
    return events;
  }

  /** Offer the boon cards for one pending level, or null when none is owed. */
  function offerChoices() {
    if (state.player.pendingLevels <= 0) return null;
    state.choices = levelUpChoices(state.player, random);
    return state.choices;
  }

  /** Spend one pending level on a boon (or the mend fallback). */
  function chooseBoon(id) {
    if (state.player.pendingLevels <= 0) return false;
    if (id === 'mend') applyMend(state.player);
    else if (!applyBoon(state.player, id)) return false;
    state.player.pendingLevels -= 1;
    state.choices = null;
    return true;
  }

  /**
   * A hero's build for the victory screenshot: every boon well stacked, so
   * the autopilot's run is a real win, not a staged one.
   */
  function heroBuild() {
    const player = state.player;
    player.maxHp = 300;
    player.hp = 300;
    player.bolts = 5;
    player.damage = 32;
    player.fireInterval = 0.2;
    player.speed = 320;
    player.magnetRadius = 300;
    player.auraDps = 45;
    player.auraRadius = 150;
    player.orbiters = 3;
    player.novaLevel = 4;
    player.novaDamage = 90;
    player.crit = 0.5;
    player.boons = { volley: 4, might: 5, swift: 5, stride: 5, heart: 5, halo: 3, aura: 5, lode: 3, nova: 4, spark: 5 };
  }

  return {
    get state() {
      return state;
    },
    reset,
    step,
    startWave,
    offerChoices,
    chooseBoon,
    heroBuild,
    get score() {
      return state?.score ?? 0;
    },
  };
}
