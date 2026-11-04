/**
 * Tap-to-zoom viewer for the mobile story's screenshots (web). Appended to <body> (inside the RN Web
 * scroll content `position: fixed` would not be relative to the viewport). Pinch to zoom (1–4×), drag to
 * pan while zoomed, double-tap toggles 2.5×; Close, Escape, a tap on the backdrop or the back gesture
 * close it and focus returns to the screenshot. Labels come translated from the caller.
 */
export type ZoomLabels = { close: string; hint: string };

const MAX = 4;

export function openZoom(
  src: string,
  srcSet: string,
  caption: string,
  labels: ZoomLabels,
  from: HTMLElement | null,
  reduce: boolean,
) {
  const root = document.createElement("div");
  root.className = "mj-zoom";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", caption);
  const bar = document.createElement("div");
  bar.className = "zbar";
  const title = document.createElement("div");
  title.textContent = caption;
  const hint = document.createElement("small");
  hint.textContent = labels.hint;
  title.append(hint);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "mj-zbtn";
  close.textContent = labels.close;
  bar.append(title, close);
  const stage = document.createElement("div");
  stage.className = "zstage";
  const img = document.createElement("img");
  img.src = src;
  img.srcset = srcSet;
  img.sizes = "100vw";
  img.alt = caption;
  img.draggable = false;
  stage.append(img);
  root.append(bar, stage);
  // Styled by mobile.css.ts (a global <style> rendered by MobileJourney).
  document.body.append(root);

  let s = 1;
  let x = 0;
  let y = 0;
  const apply = () => {
    img.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)})`;
  };
  // Keep the image covering its box while zoomed (no panning into the void).
  const clamp = () => {
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const minX = w - w * s;
    const minY = h - h * s;
    x = Math.min(0, Math.max(minX, x));
    y = Math.min(0, Math.max(minY, y));
    if (s <= 1) {
      s = 1;
      x = 0;
      y = 0;
    }
  };
  const local = (cx: number, cy: number) => {
    const r = img.getBoundingClientRect();
    // point in the image's untransformed box
    return {
      px: (cx - r.left) / s,
      py: (cy - r.top) / s,
      ox: cx - (r.left - x),
      oy: cy - (r.top - y),
    };
  };
  const zoomAt = (cx: number, cy: number, ns: number) => {
    const { px, py, ox, oy } = local(cx, cy);
    s = Math.min(MAX, Math.max(1, ns));
    x = ox - px * s;
    y = oy - py * s;
    clamp();
    apply();
  };

  type Pt = { id: number; x: number; y: number };
  let pts: Pt[] = [];
  let startDist = 0;
  let startS = 1;
  let lastTap = 0;
  let moved = false;
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const onDown = (e: PointerEvent) => {
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone (or synthetic): track it without capture
    }
    pts.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.length === 2 && pts[0] && pts[1]) {
      startDist = dist(pts[0], pts[1]);
      startS = s;
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = pts.find((q) => q.id === e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.length >= 2 && pts[0] && pts[1] && startDist > 0) {
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      zoomAt(cx, cy, startS * (dist(pts[0], pts[1]) / startDist));
    } else if (s > 1) {
      x += dx;
      y += dy;
      clamp();
      apply();
    }
  };
  const onUp = (e: PointerEvent) => {
    pts = pts.filter((q) => q.id !== e.pointerId);
    if (pts.length < 2) startDist = 0;
    if (pts.length === 0 && !moved) {
      const now = performance.now();
      if (now - lastTap < 320) {
        zoomAt(e.clientX, e.clientY, s > 1 ? 1 : 2.5);
        lastTap = 0;
      } else {
        lastTap = now;
        // a single tap on the dark backdrop (not the picture) closes
        if (e.target === stage) done();
      }
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      done();
    } else if (e.key === "Tab") {
      // the only focusable control is Close: keep focus inside the dialog
      e.preventDefault();
      close.focus();
    }
  };
  // Android / iOS back gesture closes the viewer instead of leaving the page.
  const onPop = () => {
    finish(false);
  };
  stage.addEventListener("pointerdown", onDown);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onUp);
  stage.addEventListener("wheel", onWheel, { passive: false });
  close.addEventListener("click", () => {
    done();
  });
  window.addEventListener("keydown", onKey);
  history.pushState({ mjZoom: true }, "");
  window.addEventListener("popstate", onPop);

  let closed = false;
  function finish(popHistory: boolean) {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("popstate", onPop);
    if (popHistory && (history.state as { mjZoom?: boolean } | null)?.mjZoom) history.back();
    root.classList.remove("open");
    window.setTimeout(
      () => {
        root.remove();
      },
      reduce ? 0 : 200,
    );
    from?.focus({ preventScroll: true });
  }
  function done() {
    finish(true);
  }
  requestAnimationFrame(() => {
    root.classList.add("open");
    close.focus({ preventScroll: true });
  });
  return done;
}
