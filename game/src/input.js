// Keyboard and mouse, read once a frame. Movement is WASD or the arrow keys;
// Space or Enter confirms, P or Escape pauses, M mutes, and 1/2/3 pick a boon
// card. The mouse position is kept in canvas pixels (the canvas is 1280x720
// inside, however large it shows on screen) and clicks are queued so a fast
// click is never lost between frames.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 640;
  let mouseY = 360;
  let clickX = null;
  let clickY = null;

  function toCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyM') {
      actions |= ACTION_MUTE;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
  });
  canvas.addEventListener('mousemove', (event) => {
    const point = toCanvas(event);
    mouseX = point.x;
    mouseY = point.y;
  });
  canvas.addEventListener('mousedown', (event) => {
    const point = toCanvas(event);
    mouseX = point.x;
    mouseY = point.y;
    clickX = point.x;
    clickY = point.y;
  });

  function direction() {
    let x = 0;
    let y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2);
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  return {
    direction,
    /** The actions pressed since the last call, then cleared. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** True while the named digit key (1, 2 or 3) is held down. */
    digitPressed(digit) {
      return keys.has(`Digit${digit}`);
    },
    get mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** The queued click position, if any, then cleared. */
    takeClick() {
      if (clickX === null) return null;
      const point = { x: clickX, y: clickY };
      clickX = null;
      clickY = null;
      return point;
    },
  };
}
