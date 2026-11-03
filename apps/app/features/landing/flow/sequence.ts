/**
 * Scroll-scrubbed walk-through on ONE canvas (web only): three frame sequences (street → reception,
 * reception → treatment area, treatment area → back office) exported by design/hero/scripts/walk_frames.py
 * from fal-generated 4K video. 90 frames per walk, neighbours cross-blended. Desktop frames are 2048 px wide (~4 MB per walk), mobile
 * frames 720×1280 portrait crops that pan with the subject (~2 MB per walk).
 *
 * Smoothness: the position is a float, and the two neighbouring frames are cross-blended, so slow scrolling
 * glides instead of stepping. Loading is progressive (every 8th frame first, then 4th, 2nd, all) per walk,
 * nearest-loaded fallback, draws only in rAF when the position changes.
 */
export type Segment = "w1" | "w2" | "w3";
export const SEGMENTS: Segment[] = ["w1", "w2", "w3"];
export const FRAMES = 90;

const pad = (n: number) => String(n).padStart(3, "0");
const frameUrl = (seg: Segment, mobile: boolean, i: number) =>
  `/studio/walk/${seg}/${mobile ? "m" : "d"}/${pad(i + 1)}.webp`;

type Track = { imgs: (HTMLImageElement | null)[]; started: boolean };

export class WalkPlayer {
  private tracks = new Map<Segment, Track>();
  private seg: Segment = "w1";
  private pos = 0;
  private drawnKey = "";
  private raf = 0;
  private ctx: CanvasRenderingContext2D | null;
  readonly mobile: boolean;

  constructor(private canvas: HTMLCanvasElement) {
    this.mobile = window.matchMedia("(max-width: 899px)").matches;
    this.ctx = canvas.getContext("2d", { alpha: false });
    for (const s of SEGMENTS)
      this.tracks.set(s, { imgs: Array.from({ length: FRAMES }, () => null), started: false });
  }

  /** Progressive load of one walk (idempotent). */
  load(seg: Segment) {
    const tr = this.tracks.get(seg);
    if (!tr || tr.started) return;
    tr.started = true;
    const order: number[] = [0, FRAMES - 1];
    for (const step of [8, 4, 2, 1])
      for (let i = 0; i < FRAMES; i += step) if (!order.includes(i)) order.push(i);
    let k = 0;
    const next = () => {
      const i = order[k++];
      if (i === undefined) return;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        tr.imgs[i] = img;
        if (seg === this.seg) this.schedule(true);
        next();
      };
      img.onerror = next;
      img.src = frameUrl(seg, this.mobile, i);
    };
    for (let lane = 0; lane < 4; lane++) next();
  }

  /** Shows walk `seg` at progress 0..1 (float; neighbouring frames are blended). */
  set(seg: Segment, progress: number) {
    const pos = Math.max(0, Math.min(1, progress)) * (FRAMES - 1);
    if (seg === this.seg && Math.abs(pos - this.pos) < 0.02) return;
    this.seg = seg;
    this.pos = pos;
    // Called from GSAP's ticker (already inside rAF): draw now, never defer — deferring + cancelling on
    // every tick starved the canvas while scrolling.
    this.draw();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    // Backing store at device pixels (max 2×): frames are exported at or above that size.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.schedule(true);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.tracks.clear();
  }

  private nearest(imgs: (HTMLImageElement | null)[], i: number): number {
    for (let d = 0; d < FRAMES; d++) {
      if (imgs[i - d]) return i - d;
      if (imgs[i + d]) return i + d;
    }
    return -1;
  }

  /** For async events (a frame finished loading, resize): one pending rAF at most, never cancelled. */
  private schedule(force: boolean) {
    if (force) this.drawnKey = "";
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private cover(img: HTMLImageElement, alpha: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width: cw, height: ch } = this.canvas;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }

  private draw() {
    const tr = this.tracks.get(this.seg);
    if (!tr) return;
    const a = Math.floor(this.pos);
    const b = Math.min(FRAMES - 1, a + 1);
    const f = this.pos - a;
    const ia = tr.imgs[a] ? a : this.nearest(tr.imgs, a);
    if (ia < 0) return;
    const ib = tr.imgs[b] ? b : ia;
    const key = `${this.seg}:${String(ia)}:${String(ib)}:${f.toFixed(2)}`;
    if (key === this.drawnKey) return;
    const imgA = tr.imgs[ia];
    const imgB = tr.imgs[ib];
    if (!imgA) return;
    this.cover(imgA, 1);
    if (imgB && ib !== ia && f > 0.04) this.cover(imgB, f);
    if (this.ctx) this.ctx.globalAlpha = 1;
    this.drawnKey = key;
  }
}
