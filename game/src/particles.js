// Sparks, smoke and floating numbers, plus the screen shake that sells a
// hit. Everything here is cosmetic: it never changes the rules, only how
// loud they feel. Counts are capped so a big nova can never flood the frame.
const MAX_PARTICLES = 320;
const MAX_TEXTS = 40;

export function createParticles() {
  const sparks = [];
  const texts = [];
  let trauma = 0;

  function burst(x, y, options) {
    const count = options.count ?? 10;
    const color = options.color ?? '#ffb347';
    const speed = options.speed ?? 180;
    const size = options.size ?? 3;
    const life = options.life ?? 0.55;
    const gravity = options.gravity ?? 60;
    for (let i = 0; i < count; i += 1) {
      if (sparks.length >= MAX_PARTICLES) return;
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.3 + Math.random() * 0.7);
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: life * (0.6 + Math.random() * 0.6),
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        gravity,
      });
    }
  }

  function ring(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      if (sparks.length >= MAX_PARTICLES) return;
      const angle = (i / count) * Math.PI * 2;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * 320,
        vy: Math.sin(angle) * 320,
        life: 0.5,
        maxLife: 0.5,
        size: 4,
        color,
        gravity: 0,
      });
    }
  }

  function text(x, y, value, color) {
    if (texts.length >= MAX_TEXTS) texts.shift();
    texts.push({ x, y, value: String(value), color: color ?? '#ffd98a', life: 0.9, maxLife: 0.9 });
  }

  function shake(amount) {
    trauma = Math.min(1, trauma + amount);
  }

  function update(dt) {
    trauma = Math.max(0, trauma - dt * 1.6);
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = texts.length - 1; i >= 0; i -= 1) {
      const t = texts[i];
      t.life -= dt;
      t.y -= 42 * dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
  }

  function draw(ctx) {
    for (const p of sparks) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px Georgia, serif';
    for (const t of texts) {
      const alpha = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.fillText(t.value, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  return {
    burst,
    ring,
    text,
    shake,
    update,
    draw,
    /** The current shake offset, in pixels; (0, 0) when calm. */
    offset() {
      if (trauma <= 0) return { x: 0, y: 0 };
      const strength = trauma * trauma * 11;
      return {
        x: (Math.random() * 2 - 1) * strength,
        y: (Math.random() * 2 - 1) * strength,
      };
    },
  };
}
