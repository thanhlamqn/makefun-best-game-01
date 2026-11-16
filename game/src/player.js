// The Emberwarden: who the player is, what the lantern can do, and the
// boons a level-up offers. Boons are the run's choices that matter: each one
// stacks to five, and the three cards on offer are drawn from what is not
// yet maxed.
import { PLAYER, VIEW, xpForLevel } from './config.js';

/** Every boon: its name, what it promises, its cap, and what it does. */
export const BOONS = [
  {
    id: 'volley',
    name: 'Ember Volley',
    desc: '+1 ember bolt per volley',
    max: 4,
    apply(p) {
      p.bolts += 1;
    },
  },
  {
    id: 'might',
    name: 'Kindled Might',
    desc: '+25% bolt damage',
    max: 5,
    apply(p) {
      p.damage *= 1.25;
    },
  },
  {
    id: 'swift',
    name: 'Swift Wick',
    desc: '+18% fire rate',
    max: 5,
    apply(p) {
      p.fireInterval *= 0.85;
    },
  },
  {
    id: 'stride',
    name: 'Longstride',
    desc: '+12% move speed',
    max: 5,
    apply(p) {
      p.speed *= 1.12;
    },
  },
  {
    id: 'heart',
    name: 'Warm Heart',
    desc: '+25 max health, heal 25',
    max: 5,
    apply(p) {
      p.maxHp += 25;
      p.hp = Math.min(p.maxHp, p.hp + 25);
    },
  },
  {
    id: 'halo',
    name: 'Ember Halo',
    desc: '+1 orbiting ember (contact damage)',
    max: 3,
    apply(p) {
      p.orbiters += 1;
    },
  },
  {
    id: 'aura',
    name: 'Lantern Aura',
    desc: 'Burning aura harms nearby foes',
    max: 5,
    apply(p) {
      p.auraDps += 9;
      p.auraRadius += 14;
    },
  },
  {
    id: 'lode',
    name: 'Lodestone',
    desc: '+60% shard pickup radius',
    max: 3,
    apply(p) {
      p.magnetRadius *= 1.6;
    },
  },
  {
    id: 'nova',
    name: 'Nova Bloom',
    desc: 'A fire nova bursts out every 6s',
    max: 5,
    apply(p) {
      p.novaLevel += 1;
      p.novaDamage += 16;
    },
  },
  {
    id: 'spark',
    name: 'Lucky Spark',
    desc: '+10% critical chance (crits hit double)',
    max: 5,
    apply(p) {
      p.crit += 0.1;
    },
  },
];

export function boonById(id) {
  return BOONS.find((b) => b.id === id);
}

export function createPlayer() {
  return {
    x: VIEW.width / 2,
    y: VIEW.height / 2,
    radius: PLAYER.radius,
    speed: PLAYER.speed,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    fireInterval: PLAYER.fireInterval,
    fireTimer: 0.3,
    boltSpeed: PLAYER.boltSpeed,
    damage: PLAYER.boltDamage,
    bolts: 1,
    magnetRadius: PLAYER.magnetRadius,
    auraDps: 0,
    auraRadius: 70,
    orbiters: 0,
    orbiterAngle: 0,
    novaLevel: 0,
    novaDamage: 0,
    novaTimer: 6,
    crit: 0.05,
    /** Levels waiting to be spent on boon cards. */
    pendingLevels: 0,
    /** How many boons of each kind the run has taken. */
    boons: {},
    /** Brief invulnerability after a hit, so one touch is one hit. */
    hurtTimer: 0,
    /** Facing, for the lantern's swing; -1 left, 1 right. */
    facing: 1,
    walkPhase: 0,
  };
}

/**
 * Feed the player shards. Returns how many levels were earned; the caller
 * turns each into a boon card.
 */
export function gainXp(player, amount) {
  player.xp += amount;
  let gained = 0;
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level += 1;
    player.xpNext = xpForLevel(player.level);
    gained += 1;
  }
  return gained;
}

/** Take one boon: stack it, apply it, and count it. */
export function applyBoon(player, id) {
  const boon = boonById(id);
  if (!boon) return false;
  const stacks = player.boons[id] ?? 0;
  if (stacks >= boon.max) return false;
  player.boons[id] = stacks + 1;
  boon.apply(player);
  return true;
}

/** Three different boons the run may still take, drawn at random. */
export function levelUpChoices(player, random) {
  const open = BOONS.filter((b) => (player.boons[b.id] ?? 0) < b.max);
  const choices = [];
  while (open.length > 0 && choices.length < 3) {
    const index = random.int(open.length);
    choices.push(open.splice(index, 1)[0]);
  }
  // A run that has maxed everything still gets a heal to spend the level on.
  while (choices.length < 3) {
    choices.push({ id: 'mend', name: 'Mend the Flame', desc: 'Heal 30 health', max: 99 });
  }
  return choices;
}

/** The heal a maxed-out run takes in place of a boon. */
export function applyMend(player) {
  player.hp = Math.min(player.maxHp, player.hp + 30);
}
