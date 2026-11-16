// Everything the eye sees: the ash-field, the warden, the foes, the HUD and
// every screen (title, play, level-up, pause, game over, victory). The world
// owns the state; this file only paints it.
import { VIEW } from './config.js';
import { drawEnemy } from './enemies.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Where the three boon cards sit, so input and drawing agree. */
export const CARD_RECTS = [
  { x: 200, y: 250, w: 260, h: 220 },
  { x: 510, y: 250, w: 260, h: 220 },
  { x: 820, y: 250, w: 260, h: 220 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  // The field's quiet decor: stones and dim ember-cracks, placed once.
  const decor = [];
  for (let i = 0; i < 46; i += 1) {
    decor.push({
      x: Math.random() * VIEW.width,
      y: Math.random() * VIEW.height,
      r: 2 + Math.random() * 7,
      a: 0.05 + Math.random() * 0.1,
    });
  }
  const motes = [];
  for (let i = 0; i < 36; i += 1) {
    motes.push({
      x: Math.random() * VIEW.width,
      y: Math.random() * VIEW.height,
      r: 1 + Math.random() * 2,
      speed: 8 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function drawBackground(time) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, '#14102a');
    g.addColorStop(0.55, '#0e0a1e');
    g.addColorStop(1, '#0a0716');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // A faint warm glow where the field's old fires burned.
    for (const d of decor) {
      ctx.globalAlpha = d.a;
      ctx.fillStyle = '#3a2b55';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Drifting ember motes.
    for (const m of motes) {
      const y = ((m.y - time * m.speed) % VIEW.height + VIEW.height) % VIEW.height;
      const twinkle = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 1.5 + m.phase));
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(m.x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Vignette: the dark closes in at the edges.
    const v = ctx.createRadialGradient(640, 360, 300, 640, 360, 780);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawLanternLight(player, time) {
    const pulse = 0.16 + 0.05 * Math.sin(time * 2.2);
    const g = ctx.createRadialGradient(player.x, player.y, 10, player.x, player.y, 260);
    g.addColorStop(0, `rgba(255, 176, 92, ${pulse + 0.1})`);
    g.addColorStop(0.5, `rgba(255, 140, 60, ${pulse * 0.5})`);
    g.addColorStop(1, 'rgba(255, 140, 60, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 260, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(player, time) {
    const x = player.x;
    const y = player.y;
    const bob = Math.sin(player.walkPhase) * 2;
    // Cloak.
    ctx.save();
    ctx.translate(x, y + bob * 0.4);
    ctx.fillStyle = player.hurtTimer > 0 && Math.floor(time * 14) % 2 === 0 ? '#7a3a3a' : '#2e5e4e';
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.quadraticCurveTo(15, -12, 14, 8);
    ctx.quadraticCurveTo(8, 18, 0, 18);
    ctx.quadraticCurveTo(-8, 18, -14, 8);
    ctx.quadraticCurveTo(-15, -12, 0, -20);
    ctx.fill();
    // Hood.
    ctx.fillStyle = '#234a3e';
    ctx.beginPath();
    ctx.arc(0, -12, 10, 0, Math.PI * 2);
    ctx.fill();
    // Ember eyes.
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(-3.5, -12, 1.8, 0, Math.PI * 2);
    ctx.arc(3.5, -12, 1.8, 0, Math.PI * 2);
    ctx.fill();
    // The lantern, swinging at the facing side.
    const swing = Math.sin(time * 2 + player.walkPhase * 0.5) * 4;
    const lx = player.facing * 20;
    const ly = 2 + swing;
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.facing * 8, -4);
    ctx.lineTo(lx, ly - 6);
    ctx.stroke();
    const glow = ctx.createRadialGradient(lx, ly, 1, lx, ly, 12);
    glow.addColorStop(0, '#fff2c0');
    glow.addColorStop(0.5, '#ffb347');
    glow.addColorStop(1, 'rgba(255, 140, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2b12';
    ctx.fillRect(lx - 5, ly - 7, 10, 3);
    ctx.fillRect(lx - 5, ly + 4, 10, 3);
    ctx.restore();

    // Orbiting embers.
    if (player.orbiters > 0) {
      for (let i = 0; i < player.orbiters; i += 1) {
        const a = player.orbiterAngle + (i / player.orbiters) * Math.PI * 2;
        const ox = x + Math.cos(a) * 62;
        const oy = y + Math.sin(a) * 62;
        ctx.fillStyle = '#ff9a3c';
        ctx.beginPath();
        ctx.arc(ox, oy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe9b0';
        ctx.beginPath();
        ctx.arc(ox, oy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The burning aura.
    if (player.auraDps > 0) {
      ctx.globalAlpha = 0.14 + 0.05 * Math.sin(time * 3);
      ctx.fillStyle = '#ff8c3c';
      ctx.beginPath();
      ctx.arc(x, y, player.auraRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawBolt(bolt) {
    const g = ctx.createRadialGradient(bolt.x, bolt.y, 0, bolt.x, bolt.y, 10);
    g.addColorStop(0, '#fff6d8');
    g.addColorStop(0.4, '#ffb347');
    g.addColorStop(1, 'rgba(255, 90, 40, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bolt.x, bolt.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(bolt.x, bolt.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShard(shard, time) {
    const pulse = 1 + Math.sin(time * 6 + shard.x) * 0.18;
    ctx.save();
    ctx.translate(shard.x, shard.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffb347';
    const s = 5 * pulse;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9);
    ctx.restore();
  }

  function drawPickup(pickup, time) {
    const bob = Math.sin(time * 4 + pickup.x) * 3;
    const y = pickup.y + bob;
    if (pickup.kind === 'heart') {
      ctx.fillStyle = '#ff5a6e';
      ctx.beginPath();
      ctx.moveTo(pickup.x, y + 8);
      ctx.bezierCurveTo(pickup.x - 12, y - 2, pickup.x - 7, y - 10, pickup.x, y - 4);
      ctx.bezierCurveTo(pickup.x + 7, y - 10, pickup.x + 12, y - 2, pickup.x, y + 8);
      ctx.fill();
    } else {
      // A nova bomb: a gold star.
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 === 0 ? 13 : 6;
        const px = pickup.x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function bar(x, y, w, h, frac, fill, back) {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  function drawHud(state, ui, time) {
    const player = state.player;
    // XP bar across the top.
    bar(0, 0, VIEW.width, 8, player.xp / player.xpNext, '#ffb347', 'rgba(0,0,0,0.5)');
    // Health, level and wave, top left.
    ctx.textAlign = 'left';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(`♥ ${Math.ceil(player.hp)} / ${player.maxHp}`, 18, 38);
    bar(18, 48, 210, 12, player.hp / player.maxHp, '#ff5a6e', 'rgba(0,0,0,0.55)');
    ctx.fillStyle = '#c9b8ff';
    ctx.fillText(`Level ${player.level}`, 18, 84);
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText(`Wave ${Math.max(1, state.wave)} / 9`, 18, 108);
    // Score, kills and time, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`Score ${state.score}`, VIEW.width - 18, 38);
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#c9b8ff';
    ctx.fillText(`Slain ${state.kills}`, VIEW.width - 18, 62);
    const minutes = Math.floor(state.time / 60);
    const seconds = Math.floor(state.time % 60);
    ctx.fillText(`${minutes}:${String(seconds).padStart(2, '0')}`, VIEW.width - 18, 86);
    ctx.textAlign = 'left';
    // Boss bar, top centre.
    if (state.boss) {
      const boss = state.boss;
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px Georgia, serif';
      ctx.fillStyle = '#ffd76a';
      ctx.fillText(boss.name, VIEW.width / 2, 34);
      bar(VIEW.width / 2 - 190, 42, 380, 12, boss.hp / boss.maxHp, '#ff5a3c', 'rgba(0,0,0,0.6)');
      ctx.textAlign = 'left';
    }
    // Bottom hints.
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 233, 176, 0.75)';
    ctx.fillText('WASD / arrows to move · the lantern fires on its own · P pause · M mute', 18, VIEW.height - 16);
    if (ui.muted) {
      ctx.textAlign = 'right';
      ctx.fillText('muted', VIEW.width - 18, VIEW.height - 16);
      ctx.textAlign = 'left';
    }
    // Wave banner.
    if (ui.banner) {
      ctx.globalAlpha = ui.bannerAlpha;
      ctx.textAlign = 'center';
      ctx.font = 'bold 54px Georgia, serif';
      ctx.fillStyle = '#ffd76a';
      ctx.shadowColor = '#ff8c3c';
      ctx.shadowBlur = 24;
      ctx.fillText(ui.banner, VIEW.width / 2, 220);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
    // Hurt flash.
    if (state.hurtFlash > 0) {
      const g = ctx.createRadialGradient(640, 360, 220, 640, 360, 700);
      g.addColorStop(0, 'rgba(255,40,40,0)');
      g.addColorStop(1, `rgba(255,40,40,${0.45 * state.hurtFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10, 7, 22, 0.82)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function drawTitle(state, ui, time) {
    drawBackground(time);
    // The field plays behind the title: foes shamble, the lantern glows.
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const enemy of state.enemies) drawEnemy(ctx, enemy, time);
    ctx.restore();
    drawLanternLight(state.player, time);
    drawPlayer(state.player, time);
    ctx.fillStyle = 'rgba(8, 5, 18, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 84px Georgia, serif';
    ctx.shadowColor = '#ff8c3c';
    ctx.shadowBlur = 30;
    ctx.fillText('EMBERWARDEN', VIEW.width / 2, 220);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'italic 26px Georgia, serif';
    ctx.fillText('Keeper of the last lantern-light', VIEW.width / 2, 262);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillStyle = '#c9b8ff';
    ctx.fillText('The Hollow has swallowed the dawn. Nine waves of the Ashen come for your flame.', VIEW.width / 2, 310);
    ctx.fillText('Slay them, gather their embers, and choose your boons — then face the Hollow King.', VIEW.width / 2, 336);
    const blink = 0.7 + 0.3 * Math.sin(time * 3);
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Press SPACE or click to begin', VIEW.width / 2, 420);
    ctx.globalAlpha = 1;
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 233, 176, 0.85)';
    ctx.fillText('Move: WASD or arrow keys · The lantern fires on its own · P pause · M mute', VIEW.width / 2, 480);
    ctx.fillText('Level up to choose boons: more bolts, a burning aura, orbiting embers, novas', VIEW.width / 2, 506);
    if (ui.best > 0) {
      ctx.fillStyle = '#9fd8ff';
      ctx.fillText(`Best score: ${ui.best}`, VIEW.width / 2, 556);
    }
    ctx.textAlign = 'left';
  }

  function drawLevelUp(state, ui, time) {
    drawWorld(state, ui, time);
    ctx.fillStyle = 'rgba(8, 5, 18, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 40px Georgia, serif';
    ctx.fillText(`Level ${state.player.level} — choose a boon`, VIEW.width / 2, 190);
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#c9b8ff';
    ctx.fillText('Click a card, or press 1, 2 or 3', VIEW.width / 2, 220);
    const choices = ui.choices ?? [];
    choices.forEach((choice, i) => {
      const rect = CARD_RECTS[i];
      const hover =
        ui.mouse && ui.mouse.x >= rect.x && ui.mouse.x <= rect.x + rect.w && ui.mouse.y >= rect.y && ui.mouse.y <= rect.y + rect.h;
      panel(rect.x, rect.y, rect.w, rect.h);
      if (hover) {
        ctx.strokeStyle = '#ffd76a';
        ctx.lineWidth = 3;
        ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
      }
      ctx.fillStyle = '#ffd76a';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(`[${i + 1}]`, rect.x + rect.w / 2, rect.y + 34);
      ctx.fillStyle = '#ffe9b0';
      ctx.font = 'bold 21px Georgia, serif';
      wrapText(choice.name, rect.x + rect.w / 2, rect.y + 70, rect.w - 32, 24);
      ctx.fillStyle = '#c9b8ff';
      ctx.font = '16px system-ui, sans-serif';
      wrapText(choice.desc, rect.x + rect.w / 2, rect.y + 118, rect.w - 32, 21);
      const stacks = state.player.boons[choice.id] ?? 0;
      if (stacks > 0) {
        ctx.fillStyle = '#9fd8ff';
        ctx.font = '15px system-ui, sans-serif';
        ctx.fillText(`Owned: ${stacks}`, rect.x + rect.w / 2, rect.y + rect.h - 22);
      }
    });
    ctx.textAlign = 'left';
  }

  function wrapText(text, cx, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineHeight));
  }

  function drawPaused(state, ui, time) {
    drawWorld(state, ui, time);
    ctx.fillStyle = 'rgba(8, 5, 18, 0.7)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText('Paused', VIEW.width / 2, 320);
    ctx.font = '19px system-ui, sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText('Press P or click to carry on', VIEW.width / 2, 366);
    ctx.textAlign = 'left';
  }

  function statsLines(state, ui) {
    return [
      `Score ${state.score}`,
      `Waves cleared ${state.won ? 9 : Math.max(0, state.wave - 1)} of 9`,
      `Foes slain ${state.kills}`,
      `Level reached ${state.player.level}`,
      `Survived ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`,
      `Best score ${Math.max(ui.best, state.score)}`,
    ];
  }

  function drawOver(state, ui, time) {
    drawBackground(time);
    ctx.fillStyle = 'rgba(8, 5, 18, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a6e';
    ctx.font = 'bold 62px Georgia, serif';
    ctx.fillText('THE LIGHT GOES OUT', VIEW.width / 2, 210);
    ctx.fillStyle = '#c9b8ff';
    ctx.font = 'italic 22px Georgia, serif';
    ctx.fillText('The Ashen close over the last ember…', VIEW.width / 2, 252);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = '19px system-ui, sans-serif';
    statsLines(state, ui).forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 310 + i * 32));
    const blink = 0.7 + 0.3 * Math.sin(time * 3);
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Press SPACE or click to kindle it again', VIEW.width / 2, 540);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawWin(state, ui, time) {
    drawBackground(time);
    // Dawn breaks: a warm glow rises over the field.
    const g = ctx.createLinearGradient(0, VIEW.height, 0, 0);
    g.addColorStop(0, 'rgba(255, 179, 71, 0.28)');
    g.addColorStop(1, 'rgba(255, 179, 71, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 60px Georgia, serif';
    ctx.shadowColor = '#ff8c3c';
    ctx.shadowBlur = 26;
    ctx.fillText('DAWN BREAKS', VIEW.width / 2, 200);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'italic 22px Georgia, serif';
    ctx.fillText('The Hollow King falls — and the first sun in years rises over the ash-field.', VIEW.width / 2, 244);
    ctx.font = '19px system-ui, sans-serif';
    statsLines(state, ui).forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 300 + i * 32));
    const blink = 0.7 + 0.3 * Math.sin(time * 3);
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Press SPACE or click to play again', VIEW.width / 2, 540);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawWorld(state, ui, time) {
    ctx.save();
    const offset = state.particles.offset();
    ctx.translate(offset.x, offset.y);
    drawBackground(time);
    drawLanternLight(state.player, time);
    for (const shard of state.shards) drawShard(shard, time);
    for (const pickup of state.pickups) drawPickup(pickup, time);
    for (const shot of state.enemyShots) {
      ctx.fillStyle = '#b7a6ff';
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e3d9ff';
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r - 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const enemy of state.enemies) drawEnemy(ctx, enemy, time);
    drawPlayer(state.player, time);
    for (const bolt of state.bolts) drawBolt(bolt);
    state.particles.draw(ctx);
    ctx.restore();
    drawHud(state, ui, time);
  }

  function draw(state, screen, ui, time) {
    if (screen === SCREEN_TITLE) drawTitle(state, ui, time);
    else if (screen === SCREEN_LEVELUP) drawLevelUp(state, ui, time);
    else if (screen === SCREEN_PAUSED) drawPaused(state, ui, time);
    else if (screen === SCREEN_OVER) drawOver(state, ui, time);
    else if (screen === SCREEN_WIN) drawWin(state, ui, time);
    else drawWorld(state, ui, time);
  }

  return { draw };
}
