/**
 * Scroll-scrubbed image sequence on a canvas (web only). Frames are real video frames exported by
 * design/hero/studio/photo (fal walk-through, 4K-upscaled, every 2nd frame) and served from
 * public/studio/walk/<seg>/<d|m>/NNN.webp. Desktop frames are 2560 px wide, mobile 1280 px; the stage
 * is sized so a frame is never drawn larger than ~1.15× its native pixels.
 *
 * Loading is progressive (every 8th frame first, then 4th, 2nd, all), and drawing always uses the nearest
 * loaded frame, so scrubbing never waits on the network. Draws happen in rAF and only when the frame
 * index changes.
 */
export type Segment = "w1" | "w2" | "w3";
export const FRAMES = 90;

const pad = (n: number) => String(n).padStart(3, "0");
export const frameUrl = (seg: Segment, mobile: boolean, i: number) =>
  `/studio/walk/${seg}/${mobile ? "m" : "d"}/${pad(i + 1)}.webp`;

export class SeqPlayer {
  private imgs: (HTMLImageElement | null)[] = Array.from({ length: FRAMES }, () => null);
  private ready: boolean[] = Array.from({ length: FRAMES }, () => false);
  private want = 0;
  private drawn = -1;
  private raf = 0;
  private started = false;
  private ctx: CanvasRenderingContext2D | null;

  constructor(
    private canvas: HTMLCanvasElement,
    private seg: Segment,
    private mobile: boolean,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false });
  }

  /** Starts progressive loading (call when the section approaches the viewport). */
  load() {
    if (this.started) return;
    this.started = true;
    const order: number[] = [];
    for (const step of [8, 4, 2, 1])
      for (let i = 0; i < FRAMES; i += step) if (!order.includes(i)) order.push(i);
    if (!order.includes(FRAMES - 1)) order.splice(1, 0, FRAMES - 1);
    let k = 0;
    const next = () => {
      const i = order[k++];
      if (i === undefined) return;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        this.ready[i] = true;
        this.imgs[i] = img;
        if (this.drawn !== this.want) this.schedule();
        next();
      };
      img.onerror = next;
      img.src = frameUrl(this.seg, this.mobile, i);
    };
    // A few parallel lanes keep the first coarse pass fast.
    for (let lane = 0; lane < 4; lane++) next();
  }

  /** Sets scrub progress 0..1. */
  set(progress: number) {
    const i = Math.max(0, Math.min(FRAMES - 1, Math.round(progress * (FRAMES - 1))));
    if (i === this.want) return;
    this.want = i;
    this.schedule();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const native = this.mobile ? 1280 : 2560;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.min(Math.round(r.width * dpr), native);
    this.canvas.width = w;
    this.canvas.height = Math.round((w * r.height) / Math.max(1, r.width));
    this.drawn = -1;
    this.schedule();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.imgs = [];
  }

  private nearest(i: number) {
    for (let d = 0; d < FRAMES; d++) {
      if (this.ready[i - d]) return i - d;
      if (this.ready[i + d]) return i + d;
    }
    return -1;
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this.draw();
    });
  }

  private draw() {
    const i = this.nearest(this.want);
    const img = i >= 0 ? this.imgs[i] : null;
    if (!img || !this.ctx || i === this.drawn) return;
    const { width: cw, height: ch } = this.canvas;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    this.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    this.drawn = i;
  }
}
