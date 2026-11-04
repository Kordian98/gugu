import {
  color,
  cssGradient,
  font,
  glass,
  gradient,
  motion,
  overlay,
  radius,
  shadow,
  typeScale as ty,
} from "@gugu/design-system";

/**
 * Mobile story (≤ 899 px, ADR-0014 "Mobile"): Instagram-style stories instead of the desktop book — only
 * the current page is in the layout, tap right / left turns it, vertical scrolling is ordinary page
 * scrolling. Everything here is inside the mobile media query and only injected by MobileJourney, so
 * desktop never sees a rule of it. Each page is laid out like an app screen inside ONE full-screen
 * liquid-glass panel (owner, 2026-11-05): headline, short text, a large screenshot; the photo or walk
 * shows through as a blurred, tinted mood. The chapter bar, toasts, zoom pill and center pill use the
 * same glass. Text on glass is ink / ink2 only (AA over any backdrop, tokens.test.ts); body text ≥ 16 px;
 * only transform / opacity / clip-path animate; reduced motion drops every movement.
 */
const EASE = motion.ease.out;
const SLOW = `${String(motion.duration.slow)}ms`;
const BASE = `${String(motion.duration.base)}ms`;
const ST = motion.story;
const ms = (n: number) => `${String(n)}ms`;
const px = (n: number) => `${String(n)}px`;
const BLUR = `blur(${px(glass.blur)}) saturate(${String(glass.saturate)})`;
const BLUR_CHIP = `blur(${px(glass.blurChip)}) saturate(${String(glass.saturate)})`;
/** Liquid glass surface: tint, strong blur + saturation, a bright rim and an inner light. */
const GLASS = `background:linear-gradient(180deg,${glass.tintTop},${glass.tint});-webkit-backdrop-filter:${BLUR};backdrop-filter:${BLUR};box-shadow:inset 0 1px 0 ${glass.edge},inset 0 0 0 1px ${glass.edgeSoft},${shadow.soft}`;
const GLASS_SOLID = `background:${glass.solid};-webkit-backdrop-filter:blur(${px(glass.blurChip)}) saturate(${String(glass.saturate)});backdrop-filter:blur(${px(glass.blurChip)}) saturate(${String(glass.saturate)});box-shadow:inset 0 1px 0 ${glass.edge},inset 0 0 0 1px ${glass.edgeSoft},${shadow.chip}`;
const GLASS_CHIP = `background:${glass.chip};-webkit-backdrop-filter:${BLUR_CHIP};backdrop-filter:${BLUR_CHIP};box-shadow:inset 0 1px 0 ${glass.edge},inset 0 0 0 1px ${glass.edgeSoft},${shadow.chip}`;
/** Refraction-like rim: a 1.5 px ring that is brightest at the top-left and bottom-right corners. */
const RIM = `content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;background:linear-gradient(135deg,${glass.edge},${glass.edgeSoft} 30%,${overlay.white0} 55%,${glass.edgeSoft} 78%,${glass.edge});-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none`;

export const MOBILE_CSS = `
@media (max-width:899px){
.mj{--bar:68px;--pad:16px;--edge:8px;position:relative;color:${color.ink}}
.mj-track{position:relative;touch-action:pan-y pinch-zoom;-webkit-tap-highlight-color:transparent;cursor:pointer}
.mj-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
/* stories: only the current page is in the layout; a long page simply scrolls with the page */
.mj .mj-u{display:none}
.mj .mj-u.cur{display:flex;animation:mjPage ${ms(ST.page)} ${EASE} both}
.mj .mc-track.cur{display:block}
@keyframes mjPage{from{opacity:0}to{opacity:1}}
.mj-kb{position:absolute;top:8px;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;padding:0}
.mj-kb:focus-visible{width:auto;height:44px;clip:auto;padding:0 16px;border-radius:${px(radius.xl)};background:${color.ink};color:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.label)};outline:2px solid ${color.lilac500};outline-offset:2px;z-index:2}
.mj-kb.prev{left:var(--pad)}.mj-kb.next{right:var(--pad)}
.mj-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.mj-tapfx{position:absolute;top:0;bottom:0;width:34%;z-index:25;pointer-events:none;opacity:0}
.mj-tapfx.l{left:0;background:linear-gradient(90deg,${overlay.white35},${overlay.white0})}
.mj-tapfx.r{right:0;background:linear-gradient(270deg,${overlay.white35},${overlay.white0})}
.mj-tapfx.go{animation:mjTap ${SLOW} ${EASE} both}
@keyframes mjTap{0%{opacity:1}100%{opacity:0}}
.mj-taphint{position:absolute;left:var(--pad);right:var(--pad);top:calc(var(--bar) + 10px);z-index:26;display:flex;justify-content:space-between;gap:8px;pointer-events:none;animation:mjHint ${ms(ST.hint)} ${EASE} ${ms(ST.hintDelay)} both}
.mj-taphint span{padding:8px 12px;border-radius:${px(radius.md)};background:${overlay.ink85};color:${color.white};font-family:${font.uiMedium};font-size:${px(ty.label)};line-height:1.2}
@keyframes mjHint{0%{opacity:0;transform:translate3d(0,-6px,0)}10%,85%{opacity:1;transform:none}100%{opacity:0}}

/* chapter bar: sticky; segments fill page by page; tap a chapter to open it (44 px targets) */
.mj-barwrap{position:sticky;top:0;height:0;z-index:30}
.mj-bar{position:absolute;left:var(--edge);right:var(--edge);top:6px;height:56px;box-sizing:border-box;padding:0 14px;border-radius:${px(radius.md)};${GLASS_CHIP};cursor:default}
.mj-bar::before{${RIM}}
.mj-segs{display:flex;gap:4px}
.mj-seg{position:relative;z-index:1;flex:1 1 0;min-width:0;height:44px;padding:0;border:0;background:none;display:flex;align-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mj-seg i{display:block;position:relative;width:100%;height:4px;border-radius:2px;background:${overlay.ink14};overflow:hidden}
.mj-seg i b{position:absolute;inset:0;border-radius:2px;background:${cssGradient(gradient.glowSoft)};transform-origin:left;transform:scaleX(0)}
.mj-seg:focus-visible{outline:2px solid ${color.lilac500};outline-offset:-4px;border-radius:6px}
.mj-now{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:-10px;font-family:${font.uiSemiBold};font-size:${px(ty.caption)};line-height:1.2;color:${color.ink}}
.mj-now small{font-family:${font.ui};font-size:${px(ty.micro)};color:${color.ink2};font-variant-numeric:tabular-nums}

/* a full-screen page */
.mj-s{position:relative;min-height:100svh;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;padding:var(--bar) var(--edge) calc(var(--edge) + env(safe-area-inset-bottom,0px));overflow:hidden;isolation:isolate}
.mj-bg{position:absolute;inset:0;z-index:-2;background:${color.tile}}
.mj-bg canvas,.mj-bg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
/* before → after: two complete scenes in one cell; the whole "after" screen wipes over "before" */
.mj .mj-u.cur.ba{display:grid}
.mj-s.ba{padding:0}
.mj-scene{grid-area:1/1;position:relative;min-height:100svh;box-sizing:border-box;display:flex;flex-direction:column;padding:var(--bar) var(--edge) calc(var(--edge) + env(safe-area-inset-bottom,0px));overflow:hidden;isolation:isolate}
.mj-scene.b *{animation:none!important;transition:none!important}
.mj-scene.a{clip-path:inset(0 0 0 100%)}
.mj-s.on .mj-scene.a{clip-path:inset(0 0 0 0);transition:clip-path ${ms(ST.wipe)} ${motion.ease.wipe} ${BASE}}
.mj-edge{position:absolute;top:0;bottom:0;left:100%;width:3px;margin-left:-1.5px;background:${color.white};box-shadow:${shadow.glow};opacity:0;z-index:5;pointer-events:none}
.mj-s.on .mj-edge{animation:mjEdge ${ms(ST.wipe)} ${motion.ease.wipe} ${BASE} both}
@keyframes mjEdge{0%{left:100%;opacity:1}90%{opacity:1}100%{left:0;opacity:0}}


/* the copy card */
/* the liquid-glass panel: the whole screen under the chapter bar; content flows from the top */
.mj-card{position:relative;isolation:isolate;flex:1 0 auto;display:flex;flex-direction:column;min-height:calc(100svh - var(--bar) - var(--edge) - env(safe-area-inset-bottom,0px));box-sizing:border-box;border-radius:${px(radius.xl)};padding:24px 20px 20px;${GLASS};transition:opacity ${SLOW} ${EASE},transform ${SLOW} ${EASE}}
.mj-card::before{${RIM};z-index:1}
.mj-card::after{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(120% 55% at 8% 0%,${glass.light},${overlay.white0} 62%);pointer-events:none;z-index:-1}
/* content sits in the optical centre of the panel, so short pages never look half empty */
.mj-card{justify-content:center}
.mj-more{display:flex;flex-direction:column;flex:0 0 auto}
.mj-card.folded{flex:0 0 auto;min-height:0}
/* text sitting directly on glass is ink / ink2 (AA over any photo) */
.mj-card .mj-eye,.mj-card .mj-small,.mj-card .mj-stat em,.mj-card .mj-pain,.mj-card .mj-sw .arr,.mj-card .mj-sw .done{color:${color.ink2}}
.mj-card .mj-eye::before{content:"";display:inline-block;width:18px;height:2px;margin-right:8px;vertical-align:middle;border-radius:1px;background:${cssGradient(gradient.glowSoft)}}
.mj-s.walking .mj-card,.mj-s.walking .mj-toast{opacity:0;transform:translate3d(0,24px,0);pointer-events:none}
.mj-eye{font-family:${font.uiMedium};font-size:${px(ty.micro)};letter-spacing:.22em;text-transform:uppercase;color:${color.eyebrow};margin:0 0 6px}
.mj-h{font-family:${font.display};font-size:clamp(30px,8.4vw,${px(ty.display)});line-height:1.04;letter-spacing:-.03em;margin:0;text-wrap:balance;white-space:pre-line;color:${color.ink}}
.mj-h:focus{outline:none}
.mj-p{font-family:${font.ui};font-size:${px(ty.lead)};line-height:1.5;color:${color.ink2};margin:12px 0 0;text-wrap:pretty}
.mj-small{font-family:${font.ui};font-size:${px(ty.micro)};line-height:1.45;color:${color.body};margin:10px 0 0}
.mj-tag{display:inline-flex;align-self:flex-start;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:${px(radius.sm)};font-family:${font.uiSemiBold};font-size:${px(ty.caption)};margin-bottom:10px}
.mj-tag.b{background:${color.dangerTint};color:${color.dangerInk}}
.mj-tag.a{background:${color.lilac100};color:${color.ink2}}
.mj-fold{position:absolute;top:10px;right:10px;width:44px;height:44px;border:0;border-radius:${px(radius.pill)};background:transparent;color:${color.body};line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.mj-fold i{display:block;width:12px;height:12px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-3px) rotate(45deg);transition:transform ${BASE} ${EASE}}
.mj-card.folded .mj-fold i{transform:translateY(3px) rotate(-135deg)}
.mj-card.folded .mj-more{display:none}
.mj-card .mj-h{padding-right:34px}
.mj-fold:focus-visible,.mj-go:focus-visible,.mj-zbtn:focus-visible{outline:2px solid ${color.lilac500};outline-offset:2px}
.mj-go{display:inline-flex;align-items:center;justify-content:center;gap:8px;align-self:flex-start;min-height:48px;padding:0 20px;margin-top:24px;border:0;border-radius:${px(radius.md)};background:${color.ink};color:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.body)};cursor:pointer}
.mj-go i{font-style:normal}

/* front desk */
.mj-stat{display:flex;align-items:baseline;gap:10px;margin-top:12px}
.mj-stat b{flex:0 0 auto;white-space:nowrap;font-family:${font.display};font-size:${px(ty.stat)};line-height:.9;color:${color.dangerInk};letter-spacing:-.03em}
.mj-stat b small{font-size:${px(ty.title)};margin-left:4px;letter-spacing:0}
.mj-stat span{font-family:${font.ui};font-size:${px(ty.body)};line-height:1.4;color:${color.ink2}}
.mj-stat em{display:block;font-style:normal;font-family:${font.uiMedium};font-size:${px(ty.micro)};color:${color.body};text-transform:uppercase;letter-spacing:.12em}
.mj-ping{position:relative;display:flex;gap:10px;align-items:flex-start;margin:16px 0 18px;padding:10px 12px;border-radius:${px(radius.md)};background:${color.canvas};border:1px solid ${color.lineSoft};min-height:44px}
.mj-ping .z{flex:0 0 auto;width:26px;height:26px;border-radius:8px;background:${color.zalo};color:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.caption)};display:flex;align-items:center;justify-content:center}
.mj-ping .n{font-family:${font.ui};font-size:${px(ty.body)};line-height:1.35;color:${color.ink}}
.mj-ping .n small{display:block;font-size:${px(ty.micro)};color:${color.body}}
.mj-ping .c{position:absolute;top:-8px;right:-6px;min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;border-radius:${px(radius.pill)};background:${color.dangerInk};color:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.micro)};display:flex;align-items:center;justify-content:center}
.mj-ping .n span{display:block}
.mj-s.on .mj-ping .n span{animation:mjPing ${ms(motion.duration.deliberate)} ${EASE} both}
@keyframes mjPing{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:none}}
/* "after" gains: one per line, ink numbers */
.mj-gains{display:flex;flex-direction:column;gap:6px;margin-top:12px}
.mj-gain{display:flex;align-items:baseline;gap:10px;padding:8px 12px;border-radius:${px(radius.md)};background:${color.canvas};border:1px solid ${color.lineSoft}}
.mj-gain b{flex:0 0 auto;min-width:3.2em;white-space:nowrap;font-family:${font.display};font-size:${px(ty.title)};line-height:1;letter-spacing:-.02em;color:${color.ink}}
.mj-gain span{font-family:${font.ui};font-size:${px(ty.body)};line-height:1.3;color:${color.ink2}}
.mj-toast{position:relative;display:flex;gap:10px;align-items:center;box-sizing:border-box;margin-top:16px;padding:12px 14px 12px 12px;border-radius:${px(radius.md)};${GLASS_SOLID};color:${color.ink};font-family:${font.ui};font-size:${px(ty.body)};line-height:1.35;pointer-events:none}
.mj-toast::before{${RIM}}
.mj-toast i{flex:0 0 auto;width:26px;height:26px;border-radius:${px(radius.pill)};background:${cssGradient(gradient.glowSoft)};color:${color.ink};font-style:normal;font-family:${font.uiSemiBold};font-size:${px(ty.label)};display:flex;align-items:center;justify-content:center}
.mj-toast small{display:block;font-size:${px(ty.micro)};color:${color.ink2}}
.mj-s .mj-toast.later{opacity:0;transform:translate3d(0,12px,0)}
.mj-s.on .mj-toast.later{opacity:1;transform:none;transition:opacity ${SLOW} ${EASE},transform ${SLOW} ${EASE};transition-delay:${ms(ST.wipe + motion.duration.base)}}

/* screenshots: one focused crop; the caption's Zoom button opens the viewer */
.mj-shot{position:relative;margin:18px 0 0;padding:0;border:1px solid ${color.lineSoft};border-radius:${px(radius.md)};background:${color.white};box-shadow:${shadow.soft};overflow:hidden;display:block;width:100%;text-align:left;font:inherit;color:inherit}
.mj-shot .cap{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 4px 0 12px;min-height:44px;font-family:${font.uiSemiBold};font-size:${px(ty.caption)};line-height:1.3;color:${color.ink};border-bottom:1px solid ${color.lineSoft}}
.mj-zbtn2{position:absolute;bottom:8px;right:8px;z-index:2;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border:0;border-radius:${px(radius.pill)};${GLASS_CHIP};font-family:${font.uiSemiBold};font-size:${px(ty.caption)};color:${color.ink};cursor:zoom-in}
.mj-zbtn2::before{${RIM}}
.mj-zbtn2::after{content:"";position:absolute;inset:-12px}
.mj-shot .img{cursor:zoom-in}
.mj-shot .img.row::after{display:none}
.mj-zbtn2 i{width:12px;height:12px;border:2px solid currentColor;border-radius:${px(radius.pill)};position:relative}
.mj-zbtn2 i::after{content:"";position:absolute;right:-5px;bottom:-5px;width:6px;height:2px;background:currentColor;transform:rotate(45deg)}
.mj-zbtn2:focus-visible{outline:2px solid ${color.lilac700};outline-offset:2px}
.mj-shot .img{position:relative;display:block;max-height:max(300px,var(--shot-h,44svh));overflow:hidden}
.mj-shot .img img{display:block;width:100%;height:auto}
.mj-shot .img::after{content:"";position:absolute;left:0;right:0;bottom:0;height:28px;background:linear-gradient(180deg,${overlay.white0},${color.white});pointer-events:none}
.mj-call{position:absolute;left:10px;bottom:10px;z-index:1;display:inline-flex;align-items:center;gap:6px;max-width:calc(100% - 132px);box-sizing:border-box;padding:7px 10px;border-radius:${px(radius.sm)};background:${color.ink};color:${color.white};font-family:${font.uiMedium};font-size:${px(ty.caption)};line-height:1.25;box-shadow:${shadow.chip}}
.mj-call i{font-style:normal;color:${color.pink300};font-size:9px}

/* facts / office pages on a soft veil */
.mj-n{font-family:${font.display};font-size:${px(ty.stat)};line-height:1;letter-spacing:-.03em;color:${color.ink};margin:0 0 4px}
.mj-k{font-family:${font.uiSemiBold};font-size:${px(ty.lead)};line-height:1.3;margin:0;color:${color.ink}}
.mj-pain{display:flex;gap:8px;margin:10px 0 0;font-family:${font.ui};font-size:${px(ty.body)};line-height:1.45;color:${color.body}}
.mj-pain i{font-style:normal;color:${color.dangerInk}}
.mj-pain em{font-style:normal;font-family:${font.uiMedium};color:${color.ink2};margin-right:4px}
.mj-list{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.mj-list li{display:flex;gap:10px;font-family:${font.ui};font-size:${px(ty.body)};line-height:1.4;color:${color.ink2}}
.mj-list li i{flex:0 0 auto;width:22px;height:22px;margin-top:1px;border-radius:${px(radius.pill)};background:${color.lilac100};color:${color.ink2};font-style:normal;font-size:${px(ty.micro)};display:flex;align-items:center;justify-content:center}


/* earnings card: big touch sliders (a slider drag never scrolls or turns the page) */
.mj .mj-card .calc{padding:0;background:none;border:0;box-shadow:none}
.mj .calc-t{font-size:${px(ty.lead)};line-height:1.3}
.mj .calc-r{margin-top:16px}
.mj .calc-r span{font-size:${px(ty.body)};color:${color.ink2}}
.mj .calc-r span b{display:none}
.mj .calc-sl{position:relative;display:block;padding-top:34px;--th:36px}
.mj .calc-sl input{display:block;width:100%;height:44px;margin:0;padding:0;touch-action:none;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mj .calc-sl input:focus-visible{outline:2px solid ${color.lilac700};outline-offset:4px;border-radius:${px(radius.sm)}}
/* the fill ends at the thumb's centre: half a thumb + k × (track − thumb) */
.mj .calc-sl input::-webkit-slider-runnable-track{height:10px;border-radius:5px;background:linear-gradient(90deg,${color.lilac700} 0,${color.lilac700} calc(var(--th) / 2 + (100% - var(--th)) * var(--k)),${color.lilac100} calc(var(--th) / 2 + (100% - var(--th)) * var(--k)),${color.lilac100} 100%)}
.mj .calc-sl input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:var(--th);height:var(--th);margin-top:-13px;border-radius:${px(radius.pill)};background:${color.white};border:3px solid ${color.lilac700};box-shadow:${shadow.thumb}}
.mj .calc-sl input::-moz-range-track{height:10px;border-radius:5px;background:${color.lilac100}}
.mj .calc-sl input::-moz-range-progress{height:10px;border-radius:5px;background:${color.lilac700}}
.mj .calc-sl input::-moz-range-thumb{width:30px;height:30px;border-radius:${px(radius.pill)};background:${color.white};border:3px solid ${color.lilac700};box-shadow:${shadow.thumb}}
/* the value label rides above the thumb and never leaves the card */
.mj .calc-bub{position:absolute;top:0;left:calc(var(--th) / 2 + (100% - var(--th)) * var(--k));transform:translateX(calc(var(--k) * -100%));padding:5px 10px;border-radius:${px(radius.pill)};background:${color.ink};color:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.label)};line-height:1.2;white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none}
.mj .calc-out b{font-size:${px(ty.stat)};background:none;-webkit-background-clip:initial;background-clip:initial;color:${color.ink}}
.mj .calc-t{font-family:${font.display};font-weight:400;font-size:clamp(28px,8vw,${px(ty.display)});line-height:1.05;letter-spacing:-.03em}
.mj .calc-out span{font-size:${px(ty.body)}}
.mj .calc-year{font-size:${px(ty.body)};color:${color.ink2}}
.mj .calc-note{font-size:${px(ty.micro)};color:${color.ink2}}
.mj .calc-note a{display:inline-block;padding:6px 0}

/* switching: the price list becomes services (UI type; one short script accent) */
.mj-sw{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.mj-sw .paper{position:relative;display:grid;grid-template-columns:1fr 1fr;column-gap:14px;padding:12px;border-radius:${px(radius.sm)};background:${color.paper};border:1px solid ${color.paperLine};font-family:${font.ui};font-size:${px(ty.body)};line-height:1.35;color:${color.ink2}}
.mj-sw .paper em{position:absolute;top:-12px;right:10px;font-style:normal;font-family:${font.script};font-size:${px(ty.lead)};color:${color.eyebrow};transform:rotate(-8deg)}
.mj-sw .arr{display:flex;align-items:center;gap:8px;font-family:${font.uiMedium};font-size:${px(ty.label)};color:${color.lilac700}}
.mj-sw .arr b{font-family:${font.uiSemiBold};font-weight:400;font-size:${px(ty.lead)}}
.mj-sw .svc{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.mj-sw .row{display:flex;flex-direction:column;gap:1px;padding:7px 10px;border-radius:10px;background:${color.white};border:1px solid ${color.lineSoft};font-family:${font.ui};font-size:${px(ty.body)};line-height:1.25;color:${color.ink}}
.mj-sw .row b{font-family:${font.uiSemiBold};font-weight:400}
.mj-sw .row em{font-style:normal;color:${color.body};white-space:nowrap}
.mj-s .mj-sw .row{opacity:0;transform:translate3d(0,10px,0)}
.mj-s.on .mj-sw .row{opacity:1;transform:none;transition:opacity ${SLOW} ${EASE},transform ${SLOW} ${EASE};transition-delay:calc(${ms(motion.duration.deliberate)} + var(--i) * ${ms(motion.duration.fast)})}
@media (max-height:700px){.mj-sw .paper{display:none}}
.mj-sw .done{font-family:${font.uiMedium};font-size:${px(ty.label)};color:${color.lilac700}}
.mj-steps{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.mj-steps li{display:flex;gap:10px;align-items:flex-start;font-family:${font.ui};font-size:${px(ty.body)};line-height:1.4;color:${color.ink2}}
.mj-steps b{flex:0 0 auto;width:24px;height:24px;border-radius:${px(radius.pill)};background:${color.ink};color:${color.white};font-family:${font.uiSemiBold};font-weight:400;font-size:${px(ty.caption)};display:flex;align-items:center;justify-content:center}

/* entrance of the card content when a page opens */
.mj-s .mj-in{opacity:0;transform:translate3d(0,16px,0)}
.mj-s.on .mj-in{opacity:1;transform:none;transition:opacity ${SLOW} ${EASE},transform ${SLOW} ${EASE};transition-delay:calc(var(--i,0) * 60ms)}

/* perspectives: full-screen chats; each step is a story page */
.mc-track{position:relative}
.mc-pin{position:relative;height:100svh;display:flex;flex-direction:column;box-sizing:border-box;padding-top:var(--bar);overflow:hidden}
.mc-client .mc-pin{background:${color.zaloChat}}
.mc-ai .mc-pin{background:${color.canvas}}
.mc-copy{position:relative;z-index:2;margin:4px var(--pad) 8px;padding:12px 14px;border-radius:${px(radius.md)};${GLASS_CHIP}}
.mc-copy .mj-eye{margin-bottom:2px}
.mc-copy .mj-eye,.mc-copy .n,.mc-copy .mc-note{color:${color.ink2}}
.mc-stepc{display:grid}
.mc-stepc>*{grid-area:1/1}
.mc-ghost{visibility:hidden}
.mc-live b,.mc-ghost b{display:block;font-family:${font.uiSemiBold};font-weight:400;font-size:${px(ty.lead)};line-height:1.3;color:${color.ink}}
.mc-live p,.mc-ghost p{margin:4px 0 0;font-family:${font.ui};font-size:${px(ty.body)};line-height:1.45;color:${color.ink2}}
.mc-live .n,.mc-ghost .n{font-family:${font.uiSemiBold};font-size:${px(ty.micro)};color:${color.lilac700};letter-spacing:.08em}
.mc-live>*{animation:mcIn ${SLOW} ${EASE} both}
.mc-live>*:nth-child(2){animation-delay:60ms}
.mc-live>*:nth-child(3){animation-delay:120ms}
@keyframes mcIn{from{opacity:0;transform:translate3d(0,16px,0)}to{opacity:1;transform:none}}
.mc-dots{display:flex;gap:4px;margin-top:8px}
.mc-dots i{flex:1;height:3px;border-radius:2px;background:${overlay.ink14}}
.mc-dots i.on{background:${cssGradient(gradient.glowSoft)}}
.mc-app{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;background:${color.white};border-radius:${px(radius.lg)} ${px(radius.lg)} 0 0;box-shadow:${shadow.lift};overflow:hidden}
.mc-client .mc-app{background:${color.zaloChat}}
.mc-top{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:10px 14px;background:${color.white};border-bottom:1px solid ${color.lineSoft}}
.mc-client .mc-top{background:${color.zalo};color:${color.white};border-bottom:0}
.mc-top .back{font-size:24px;line-height:1;width:18px}
.mc-ava{position:relative;flex:0 0 auto;width:38px;height:38px;border-radius:${px(radius.pill)};background:${color.lilac300};color:${color.ink};font-style:normal;font-family:${font.uiSemiBold};font-size:${px(ty.label)};display:flex;align-items:center;justify-content:center}
.mc-ava em{position:absolute;right:-6px;bottom:-4px;padding:1px 4px;border-radius:6px;background:${color.white};color:${color.zalo};font-style:normal;font-size:9px;font-family:${font.uiSemiBold}}
.mc-who{min-width:0}
.mc-who b{display:block;font-family:${font.uiSemiBold};font-weight:400;font-size:${px(ty.body)};line-height:1.2}
.mc-who small{display:block;font-family:${font.ui};font-size:${px(ty.caption)}}
.mc-plan{margin-left:6px;padding:1px 6px;border-radius:6px;background:${color.lilac100};color:${color.ink2};font-style:normal;font-size:${px(ty.micro)}}
/* the log scrolls (answers can be longer than the screen); it is scrolled to the newest message */
.mc-log{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 12px 8px;display:flex;flex-direction:column;gap:8px;scrollbar-width:none}
.mc-log::-webkit-scrollbar{display:none}
.mc-day{align-self:center;padding:3px 10px;border-radius:10px;background:${overlay.ink10};font-family:${font.ui};font-size:${px(ty.micro)};color:${color.ink2}}
.mc-msg{display:flex;gap:8px;max-width:86%;animation:mcMsg ${ms(ST.page)} ${EASE} both}
.mc-msg.me{align-self:flex-end;flex-direction:row-reverse}
.mc-msg.sys{align-self:center;max-width:100%}
.mc-msg.has-viz{max-width:100%;width:100%}
@keyframes mcMsg{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}
.mc-col{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1 1 auto}
.mc-msg.me .mc-col{align-items:flex-end}
.mc-bub{padding:9px 12px;border-radius:${px(radius.md)};background:${color.white};font-family:${font.ui};font-size:${px(ty.body)};line-height:1.4;color:${color.ink};white-space:pre-line;box-shadow:${shadow.hair}}
.mc-msg.me .mc-bub{background:${color.zaloSent}}
.mc-ai .mc-msg.me .mc-bub{background:${color.ink};color:${color.white}}
.mc-ai .mc-msg.them .mc-bub{background:${color.tile}}
.mc-msg.staff .mc-bub{border:1px solid ${color.lilac300}}
.mc-msg.sys .mc-bub{background:${overlay.ink10};font-size:${px(ty.caption)};padding:3px 10px;box-shadow:none;color:${color.ink2}}
.mc-msg.card .mc-bub{border-left:4px solid ${color.zalo}}
.mc-gu{flex:0 0 auto;width:30px;height:30px;border-radius:${px(radius.pill)};background:${cssGradient(gradient.glowSoft)};color:${color.ink};font-family:${font.uiSemiBold};font-size:${px(ty.micro)};display:flex;align-items:center;justify-content:center}
.mc-btns{display:flex;flex-wrap:wrap;gap:6px}
.mc-btns span{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border-radius:${px(radius.md)};background:${color.white};border:1px solid ${color.zalo};color:${color.zalo};font-family:${font.uiMedium};font-size:${px(ty.label)}}
.mc-time{font-family:${font.ui};font-size:${px(ty.micro)};color:${color.body}}
.mc-src{display:inline-flex;align-items:center;gap:6px;font-family:${font.uiMedium};font-size:${px(ty.micro)};color:${color.lilac700}}
.mc-src i{width:6px;height:6px;border-radius:3px;background:${color.lilac500}}
.mc-viz{margin-top:10px}
.mc-viz .av-tile b{font-size:${px(ty.title)}}
.mc-viz .av-tile small,.mc-viz .av-row,.mc-viz .av-week em{font-size:${px(ty.caption)};color:${color.ink2}}
.mc-viz .av-tiles{grid-template-columns:repeat(2,1fr)}
.mc-viz .av-week{height:72px}
.mc-viz .av-rev b{font-size:${px(ty.lead)}}
.mc-viz .av-rev small,.mc-viz .av-rev em{font-size:${px(ty.caption)}}
.mc-typing{display:flex;gap:4px;align-items:center;min-height:22px}
.mc-typing i{width:7px;height:7px;border-radius:4px;background:${color.body};animation:mcDot 1s infinite ease-in-out both}
.mc-typing i:nth-child(2){animation-delay:.15s}.mc-typing i:nth-child(3){animation-delay:.3s}
.mc-typing span{margin-left:6px;font-family:${font.ui};font-size:${px(ty.label)};color:${color.body}}
@keyframes mcDot{0%,80%,100%{opacity:.3;transform:none}40%{opacity:1;transform:translate3d(0,-3px,0)}}
.mc-input{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));background:${color.white};border-top:1px solid ${color.lineSoft}}
.mc-input .f{flex:1;min-width:0;height:38px;border-radius:${px(radius.pill)};background:${color.tile};display:flex;align-items:center;padding:0 14px;font-family:${font.ui};font-size:${px(ty.body)};color:${color.body};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-input .s{width:38px;height:38px;border-radius:${px(radius.pill)};background:${color.zalo};color:${color.white};display:flex;align-items:center;justify-content:center;font-size:${px(ty.lead)}}
.mc-ai .mc-input .s{background:${color.ink}}
.mc-privacy{margin:0;padding:0 14px 8px;background:${color.white};font-family:${font.ui};font-size:${px(ty.micro)};line-height:1.4;color:${color.body}}
.mc-note{margin:6px 0 0;font-family:${font.ui};font-size:${px(ty.micro)};line-height:1.4;color:${color.body}}
/* GuGu Studio toasts: what the salon's system just did (shown, then gone) */
.mc-toast{position:absolute;left:12px;right:12px;top:66px;z-index:3;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:${px(radius.md)};${GLASS_SOLID};color:${color.ink};font-family:${font.ui};font-size:${px(ty.body)};line-height:1.3;box-shadow:${shadow.toast};pointer-events:none;animation:mcToast ${ms(ST.toast)} ${EASE} both}
.mc-toast i{flex:0 0 auto;width:28px;height:28px;border-radius:9px;background:${cssGradient(gradient.glowSoft)};display:flex;align-items:center;justify-content:center;font-style:normal;font-family:${font.uiSemiBold};font-size:${px(ty.micro)};color:${color.ink}}
.mc-toast small{display:block;font-size:${px(ty.micro)};color:${color.ink2}}
.mc-toast::before{${RIM}}
@keyframes mcToast{0%{opacity:0;transform:translate3d(0,-14px,0)}10%,85%{opacity:1;transform:none}100%{opacity:0;transform:translate3d(0,-8px,0);visibility:hidden}}

/* "Center view": glass pill in the thumb zone while the story is partly out of view */
.mj-center{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:40;display:inline-flex;white-space:nowrap;max-width:calc(100vw - 32px);box-sizing:border-box;align-items:center;gap:8px;min-height:44px;padding:0 18px;border:0;border-radius:${px(radius.pill)};${GLASS_CHIP};color:${color.ink};font-family:${font.uiSemiBold};font-size:${px(ty.label)};cursor:pointer;animation:mjCenter ${SLOW} ${EASE} both}
.mj-center::before{${RIM}}
.mj-center[hidden]{display:none}
.mj-center i{font-style:normal}
.mj-center:focus-visible{outline:2px solid ${color.lilac700};outline-offset:3px}
@keyframes mjCenter{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}

/* tap-to-zoom viewer (appended to <body>) */
.mj-zoom{position:fixed;inset:0;z-index:1000;background:${overlay.ink95};display:flex;flex-direction:column;opacity:0;transition:opacity ${BASE} ${EASE};touch-action:none}
.mj-zoom.open{opacity:1}
.mj-zoom .zbar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(8px + env(safe-area-inset-top,0px)) 8px 8px 16px;color:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.body)}}
.mj-zoom .zbar small{display:block;font-family:${font.ui};font-size:${px(ty.caption)};color:${color.lilac300}}
.mj-zbtn{position:relative;flex:0 0 auto;min-width:44px;height:44px;padding:0 16px;border:0;border-radius:${px(radius.pill)};background:${glass.dark};-webkit-backdrop-filter:${BLUR_CHIP};backdrop-filter:${BLUR_CHIP};box-shadow:inset 0 1px 0 ${glass.darkEdge},inset 0 0 0 1px ${glass.dark};color:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.body)};cursor:pointer}
.mj-zoom .zstage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center}
.mj-zoom .zstage img{max-width:100%;max-height:100%;width:auto;height:auto;transform-origin:0 0;will-change:transform;border-radius:10px;background:${color.white};user-select:none;-webkit-user-drag:none}

/* short phones (360×640, 375×667): a little tighter; nothing is dropped except duplicates (readable
   first; a long page scrolls) */
@media (max-height:820px){.mj-ping .n span:nth-child(n+3){display:none}}
@media (orientation:portrait) and (max-height:700px){
  .mj-h{font-size:clamp(28px,8vw,34px)}
  .mj-card{padding:18px 16px 16px}
  .mj-card .mj-tag+.mj-eye{display:none}
  .mj-ping .n span+span{display:none}
  .mj-stat b{font-size:${px(ty.display)}}
  .mj-p{font-size:${px(ty.body)}}
  .mj-go{min-height:44px}
  .mj-gains{margin-top:10px;gap:4px}
  .mj-gain{padding:6px 10px}
  .mc-copy{padding:8px 12px;margin-bottom:6px}
  .mc-copy .mj-eye,.mc-stepc p,.mc-stepc .n,.mc-note{display:none}
}
/* landscape phones: compact; the copy sits on the left, the receptionist (right half) stays free */
@media (orientation:landscape) and (max-height:520px){
  .mj{--bar:52px}
  .mj-now{margin-top:-14px}
  .mj .jr-static .jr-frame,.mj .jr-plaque{display:none}
  .mj-s{flex-direction:row;align-items:flex-end;justify-content:flex-start;gap:12px;padding:calc(var(--bar) + 4px) max(var(--pad),env(safe-area-inset-right,0px)) 12px max(var(--pad),env(safe-area-inset-left,0px))}
  .mj-s>.mj-card{width:min(420px,46%)}
  .mj-s .mj-card .mj-tag+.mj-eye,.mj-s .mj-ping,.mj-s .mj-small,.mj-s .mj-gain:nth-child(n+3){display:none}
  .mj-s .mj-card{padding:12px 14px}
  .mj-stat{margin-top:6px}
  .mj-go{min-height:44px;margin-top:8px}
  .mj-s.plain{flex-direction:row;align-items:center;justify-content:center}
  .mj-s.plain>.mj-shot{flex:1 1 0;min-width:0;margin:0;--shot-h:calc(100svh - var(--bar) - 70px)}
  .mj-s.plain>.mj-card{flex:1 1 0;min-width:0;max-width:440px}
  .mj-h{font-size:${px(ty.numeral)}}
  .mj-stat b{font-size:${px(ty.display)}}
  .mc-pin{flex-direction:row}
  .mc-copy{flex:0 0 38%;align-self:flex-start;margin:6px 8px 8px var(--pad)}
  .mc-copy .mc-stepc p,.mc-note{display:none}
  .mc-app{border-radius:${px(radius.lg)} ${px(radius.lg)} 0 0;margin-right:var(--pad)}
}
@media (prefers-reduced-motion:reduce){
  .mj *,.mj *::before,.mj *::after{animation:none!important;transition:none!important}
  .mj-s .mj-in,.mj-s .mj-sw .row{opacity:1;transform:none}
  .mj-scene.a{clip-path:none}
  .mj-s .mj-toast.later{opacity:1;transform:none}
  .mj-center{animation:none!important;transition:none!important}
  .mj-edge{display:none}
  /* no fade-out without motion: the toast sits in the flow above the log, never over the messages */
  .mc-toast{position:relative;top:auto;left:auto;right:auto;margin:8px 12px 0;opacity:1}
  .mj-taphint{opacity:1}
  .mj-zoom{transition:none}
}
}
`;

/** Walk-in playback duration (ms). */
export const WALK_MS = motion.story.walk;
