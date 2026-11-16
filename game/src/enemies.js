// The foes of the ash-field: what each kind is, how it moves and fights, and
// how it looks. The world owns the lists; this file owns one foe at a time.
// Bosses are foes too, with a name, a health bar and attacks of their own.
import { SCORE } from './config.js';

export const KIND_CINDER = 'cinder';
export const KIND_WISP = 'wisp';
export const KIND_SPITTER = 'spitter';
export const KIND_BRUTE = 'brute';
export const KIND_BOSS = 'boss';

/** The table every foe is built from: base health, speed, size and harm. */
const KINDS = {
  cinder: {
    name: 'Cinder',
    hp: 14,
    speed: 72,
    radius: 14,
    damage: 8,
    xp: 1,
    score: SCORE.cinder,
    body: '#6d5ba8',
    glow: '#c9b8ff',
  },
  wisp: {
    name: 'Wisp',
    hp: 9,
    speed: 138,
    radius: 11,
    damage: 6,
    xp: 1,
    score: SCORE.wisp,
    body: '#4f7fa8',
    glow: '#a5dcff',
  },
  spitter: {
    name: 'Spitter',
    hp: 18,
    speed: 56,
    radius: 15,
    damage: 6,
    xp: 2,
    score: SCORE.spitter,
    body: '#7a4f8f',
    glow: '#e3a9ff',
    ranged: true,
  },
  brute: {
    name: 'Brute',
    hp: 64,
    speed: 44,
    radius: 22,
    damage: 16,
    xp: 3,
    score: SCORE.brute,
    body: '#54486b',
    glow: '#ffb347',
  },
};

/** The three bosses, one at the end of every third wave. */
const BOSSES = {
  3: {
    name: 'Cinder Colossus',
    hp: 720,
    speed: 52,
    radius: 40,
    damage: 20,
    xp: 12,
    score: SCORE.boss,
    body: '#4a3f6e',
    glow: '#ffb347',
  },
  6: {
    name: 'Hollow Matriarch',
    hp: 1250,
    speed: 58,
    radius: 42,
    damage: 22,
    xp: 16,
    score: SCORE.boss,
    body: '#3f4a6e',
    glow: '#e3a9ff',
  },
  9: {
    name: 'The Hollow King',
    hp: 2100,
    speed: 66,
    radius: 48,
    damage: 26,
    xp: 24,
    score: SCORE.boss,
    body: '#2e2a4a',
    glow: '#ffd76a',
  },
};

export function bossName(wave) {
  return BOSSES[wave]?.name ?? 'Boss';
}

export function createEnemy(kind, x, y, wave, hpScale, speedScale, random) {
  const table = kind === KIND_BOSS ? BOSSES[wave] : KINDS[kind];
  const hp = Math.round(table.hp * hpScale);
  return {
    kind,
    name: table.name,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: table.radius,
    hp,
    maxHp: hp,
    speed: table.speed * speedScale,
    damage: table.damage,
    xp: table.xp,
    score: table.score,
    body: table.body,
    glow: table.glow,
    ranged: Boolean(table.ranged),
    isBoss: kind === KIND_BOSS,
    wave,
    /** Seconds until this foe may hurt the player by touch again. */
    contactTimer: 0,
    /** Seconds until its next ranged attack. */
    shootTimer: 2 + random.range(0, 1.5),
    /** Seconds until its next special (bosses only). */
    specialTimer: 3.5,
    /** Spiral-burst state (Matriarch). */
    burstLeft: 0,
    burstAngle: 0,
    /** Charge state (Hollow King): '', 'aim', 'dash'. */
    charge: '',
    chargeTimer: 0,
    chargeX: 0,
    chargeY: 0,
    /** Which summon thresholds it has already spent. */
    summoned66: false,
    summoned33: false,
    /** Flashes white briefly when a bolt lands. */
    hitFlash: 0,
    /** Wobble phase for its idle animation. */
    wobble: random.range(0, Math.PI * 2),
    dead: false,
  };
}

/** A ring of enemy shots, aimed around a centre. */
function radial(hooks, x, y, count, speed, damage, offset) {
  for (let i = 0; i < count; i += 1) {
    const angle = offset + (i / count) * Math.PI * 2;
    hooks.spawnEnemyShot(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, damage);
  }
}

/**
 * Move one foe for a step and run its attacks. `hooks` is the world: it
 * spawns enemy shots and minions, and tells the foe where the player is.
 */
export function updateEnemy(enemy, player, dt, hooks) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  enemy.wobble += dt * 4;
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  enemy.contactTimer = Math.max(0, enemy.contactTimer - dt);

  if (enemy.isBoss) {
    updateBoss(enemy, player, dt, hooks, nx, ny, dist);
    return;
  }

  if (enemy.ranged) {
    // Spitters hold their distance and spit globs.
    const want = 260;
    const toward = dist > want + 30 ? 1 : dist < want - 30 ? -1 : 0;
    enemy.x += nx * enemy.speed * toward * dt;
    enemy.y += ny * enemy.speed * toward * dt;
    enemy.shootTimer -= dt;
    if (enemy.shootTimer <= 0 && dist < 560) {
      hooks.spawnEnemyShot(enemy.x, enemy.y, nx * 210, ny * 210, enemy.damage);
      hooks.onEnemyShoot(enemy);
      enemy.shootTimer = 2.4;
    }
    return;
  }

  // Chasers shamble straight at the lantern, with a slight wobble.
  const wobble = Math.sin(enemy.wobble) * 0.25;
  const px = -ny * wobble;
  const py = nx * wobble;
  enemy.x += (nx + px) * enemy.speed * dt;
  enemy.y += (ny + py) * enemy.speed * dt;
}

function updateBoss(enemy, player, dt, hooks, nx, ny, dist) {
  const wave = enemy.wave;
  const hpFrac = enemy.hp / enemy.maxHp;

  // Summoning at two thirds and one third health.
  if (!enemy.summoned66 && hpFrac <= 0.66) {
    enemy.summoned66 = true;
    hooks.summonMinions(enemy, wave === 9 ? KIND_BRUTE : KIND_CINDER, 3);
  }
  if (!enemy.summoned33 && hpFrac <= 0.33) {
    enemy.summoned33 = true;
    hooks.summonMinions(enemy, wave === 6 ? KIND_WISP : KIND_CINDER, 4);
  }

  if (wave === 9 && enemy.charge !== '') {
    // The Hollow King telegraphs, then dashes.
    enemy.chargeTimer -= dt;
    if (enemy.charge === 'aim') {
      enemy.chargeX = nx;
      enemy.chargeY = ny;
      if (enemy.chargeTimer <= 0) {
        enemy.charge = 'dash';
        enemy.chargeTimer = 0.45;
        hooks.onBossDash(enemy);
      }
    } else if (enemy.chargeTimer <= 0) {
      enemy.charge = '';
      enemy.specialTimer = 5;
    } else {
      enemy.x += enemy.chargeX * 540 * dt;
      enemy.y += enemy.chargeY * 540 * dt;
    }
    return;
  }

  // Every boss walks at the player; the King also starts a charge now and then.
  enemy.x += nx * enemy.speed * dt;
  enemy.y += ny * enemy.speed * dt;

  enemy.specialTimer -= dt;
  if (enemy.specialTimer > 0) return;
  if (wave === 3) {
    radial(hooks, enemy.x, enemy.y, 12, 175, 10, enemy.wobble);
    hooks.onBossAttack(enemy);
    enemy.specialTimer = 4.5;
  } else if (wave === 6) {
    // A spiral: three quick rings, each turned a little.
    enemy.burstLeft = 3;
    enemy.burstAngle = enemy.wobble;
    enemy.specialTimer = 5;
    hooks.onBossAttack(enemy);
  } else {
    if (dist < 420 && Math.random() < 0.5) {
      enemy.charge = 'aim';
      enemy.chargeTimer = 0.7;
      hooks.onBossTelegraph(enemy);
    } else {
      radial(hooks, enemy.x, enemy.y, 14, 185, 12, enemy.wobble);
      hooks.onBossAttack(enemy);
      enemy.specialTimer = 5;
    }
  }
}

/** One spiral ring of the Matriarch's burst, fired by the world each step. */
export function bossSpiralStep(enemy, dt, hooks) {
  if (enemy.burstLeft <= 0) return;
  enemy.burstAngle += 0.55;
  radial(hooks, enemy.x, enemy.y, 8, 165, 9, enemy.burstAngle);
  enemy.burstLeft -= 1;
  hooks.onBossAttack(enemy);
}

/** Draw one foe: a body of its kind, glowing eyes, and a white hit flash. */
export function drawEnemy(ctx, enemy, time) {
  const bob = Math.sin(enemy.wobble) * 2;
  const x = enemy.x;
  const y = enemy.y + bob * 0.4;
  const r = enemy.radius;
  ctx.save();
  ctx.translate(x, y);

  if (enemy.isBoss) {
    // A crowned mass: layered rings, horns and a burning core.
    ctx.fillStyle = enemy.body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = enemy.glow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = enemy.glow;
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i - 2) * 0.42;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      ctx.lineTo(Math.cos(a + 0.16) * r * 1.22, Math.sin(a + 0.16) * r * 1.22);
      ctx.lineTo(Math.cos(a + 0.32) * r * 0.9, Math.sin(a + 0.32) * r * 0.9);
      ctx.fill();
    }
    const pulse = 0.6 + Math.sin(time * 3 + enemy.wobble) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (enemy.kind === KIND_WISP) {
    // A flickering flame-wisp with a trailing tail.
    const flicker = 1 + Math.sin(time * 9 + enemy.wobble) * 0.16;
    ctx.fillStyle = enemy.body;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.25 * flicker);
    ctx.quadraticCurveTo(r * 0.9, -r * 0.2, r * 0.55, r * 0.7);
    ctx.quadraticCurveTo(0, r * 1.05, -r * 0.55, r * 0.7);
    ctx.quadraticCurveTo(-r * 0.9, -r * 0.2, 0, -r * 1.25 * flicker);
    ctx.fill();
  } else if (enemy.kind === KIND_SPITTER) {
    // A bloated orb with a dark mouth.
    ctx.fillStyle = enemy.body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#241a33';
    ctx.beginPath();
    ctx.arc(0, r * 0.18, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === KIND_BRUTE) {
    // A heavy horned mass.
    ctx.fillStyle = enemy.body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = enemy.glow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-r * 0.45, -r * 0.5, r * 0.42, Math.PI * 0.9, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 0.45, -r * 0.5, r * 0.42, Math.PI * 1.1, Math.PI * 2.1);
    ctx.stroke();
  } else {
    // A cinder: a spiky shard-blob.
    ctx.fillStyle = enemy.body;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + enemy.wobble * 0.1;
      const rr = i % 2 === 0 ? r : r * 0.72;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Eyes, always watching the lantern.
  const eyeY = enemy.isBoss ? -r * 0.18 : -r * 0.15;
  const eyeDX = r * (enemy.isBoss ? 0.3 : 0.32);
  ctx.fillStyle = enemy.glow;
  ctx.beginPath();
  ctx.arc(-eyeDX, eyeY, enemy.isBoss ? 5 : 3, 0, Math.PI * 2);
  ctx.arc(eyeDX, eyeY, enemy.isBoss ? 5 : 3, 0, Math.PI * 2);
  ctx.fill();

  if (enemy.hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.8, enemy.hitFlash * 6);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Bosses wear their health under them.
  if (enemy.isBoss) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-r, r + 10, r * 2, 6);
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(-r, r + 10, r * 2 * Math.max(0, enemy.hp / enemy.maxHp), 6);
  }
  ctx.restore();
}
