import { color, cssGradient, font, gradient, motion } from "@gugu/design-system";

/**
 * Mobile story (≤ 899 px, ADR-0014 "Mobile"): vertical full-screen sections with scroll snap instead of the
 * desktop book. Everything here is inside the mobile media query and only injected by MobileJourney, so
 * desktop never sees a rule of it. Copy cards are white glass over the frames (ink on ≥ 92 % white: AA);
 * body text 16 px; only transform / opacity / clip-path animate; reduced motion drops every movement.
 */
const EASE = motion.ease.out;
const SLOW = motion.duration.slow;
const DELIB = motion.duration.deliberate;

export const MOBILE_CSS = `
@media (max-width:899px){
.mj{--bar:52px;--pad:16px;position:relative;color:${color.ink}}
.mj-track{position:relative}

/* chapter bar: sticky over the sections, fills with scroll; tap a chapter to go there */
.mj-barwrap{position:sticky;top:0;height:0;z-index:30}
.mj-bar{position:absolute;left:0;right:0;top:0;height:var(--bar);box-sizing:border-box;padding:8px var(--pad) 0;background:linear-gradient(180deg,rgba(253,250,247,.94),rgba(253,250,247,.78) 70%,rgba(253,250,247,0));-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.mj-segs{display:flex;gap:4px}
.mj-seg{flex:1 1 0;min-width:0;height:28px;padding:0;border:0;background:none;display:flex;align-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mj-seg i{display:block;position:relative;width:100%;height:4px;border-radius:2px;background:rgba(34,16,36,.14);overflow:hidden}
.mj-seg i b{position:absolute;inset:0;border-radius:2px;background:${cssGradient(gradient.glowSoft)};transform-origin:left;transform:scaleX(0)}
.mj-seg:focus-visible{outline:2px solid ${color.lilac500};outline-offset:2px;border-radius:4px}
.mj-now{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:-4px;font-family:${font.uiSemiBold};font-size:13px;line-height:1.2;color:${color.ink}}
.mj-now small{font-family:${font.ui};font-size:12px;color:${color.muted};font-variant-numeric:tabular-nums}

/* a full-screen section */
.mj-s{position:relative;min-height:100svh;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;padding:calc(var(--bar) + 8px) var(--pad) calc(var(--pad) + env(safe-area-inset-bottom,0px));overflow:hidden;scroll-snap-align:start;scroll-snap-stop:always;isolation:isolate}
.mj-bg{position:absolute;inset:0;z-index:-2;background:${color.tile}}
.mj-bg canvas,.mj-bg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.mj-bg .mj-after-img{clip-path:inset(0 0 0 100%)}
.mj-s.on .mj-bg .mj-after-img{clip-path:inset(0 0 0 0);transition:clip-path 1100ms cubic-bezier(.65,0,.35,1) 250ms}
.mj-edge{position:absolute;top:0;bottom:0;left:100%;width:3px;margin-left:-1.5px;background:${color.white};box-shadow:0 0 18px 4px rgba(169,139,235,.75);opacity:0;z-index:-1}
.mj-s.on .mj-edge{animation:mjEdge 1100ms cubic-bezier(.65,0,.35,1) 250ms both}
@keyframes mjEdge{0%{left:100%;opacity:1}90%{opacity:1}100%{left:0;opacity:0}}
.mj-scrim{position:absolute;left:0;right:0;bottom:0;height:62%;z-index:-1;background:linear-gradient(180deg,rgba(34,16,36,0),rgba(34,16,36,.34))}
.mj-veil{position:absolute;inset:0;z-index:-1;background:rgba(253,250,247,.86)}

/* the copy card */
.mj-card{position:relative;background:rgba(255,255,255,.94);-webkit-backdrop-filter:blur(14px) saturate(1.2);backdrop-filter:blur(14px) saturate(1.2);border-radius:22px;padding:18px 18px 16px;box-shadow:0 18px 50px rgba(42,20,38,.22);transition:opacity ${String(SLOW)}ms ${EASE},transform ${String(SLOW)}ms ${EASE}}
.mj-s.walking .mj-card,.mj-s.walking .mj-toast{opacity:0;transform:translate3d(0,24px,0);pointer-events:none}
.mj-eye{font-family:${font.uiMedium};font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:${color.eyebrow};margin:0 0 6px}
.mj-h{font-family:${font.display};font-size:clamp(30px,8.4vw,40px);line-height:1.04;letter-spacing:-.03em;margin:0;text-wrap:balance;white-space:pre-line;color:${color.ink}}
.mj-p{font-family:${font.ui};font-size:16px;line-height:1.5;color:${color.ink2};margin:10px 0 0;text-wrap:pretty}
.mj-small{font-family:${font.ui};font-size:12px;line-height:1.45;color:${color.muted};margin:10px 0 0}
.mj-tag{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:13px;font-family:${font.uiSemiBold};font-size:13px;margin-bottom:10px}
.mj-tag.b{background:${color.dangerTint};color:${color.dangerInk}}
.mj-tag.a{background:${color.lilac100};color:${color.lilac700}}
.mj-fold{position:absolute;top:10px;right:10px;width:44px;height:44px;border:0;border-radius:22px;background:transparent;color:${color.muted};font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.mj-fold i{display:block;width:12px;height:12px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-3px) rotate(45deg);transition:transform ${String(motion.duration.base)}ms ${EASE}}
.mj-card.folded .mj-fold i{transform:translateY(3px) rotate(-135deg)}
.mj-card.folded .mj-more{display:none}
.mj-card .mj-h{padding-right:34px}
.mj-fold:focus-visible,.mj-go:focus-visible,.mj-zbtn:focus-visible{outline:2px solid ${color.lilac500};outline-offset:2px}
.mj-go{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 20px;margin-top:14px;border:0;border-radius:14px;background:${color.ink};color:${color.white};font-family:${font.uiSemiBold};font-size:16px;cursor:pointer}
.mj-go i{font-style:normal}

/* front desk */
.mj-stat{display:flex;align-items:baseline;gap:10px;margin-top:12px}
.mj-stat b{flex:0 0 auto;white-space:nowrap;font-family:${font.display};font-size:56px;line-height:.9;color:${color.danger};letter-spacing:-.03em}
.mj-stat b small{font-size:26px;margin-left:4px;letter-spacing:0}
.mj-stat span{font-family:${font.ui};font-size:16px;line-height:1.4;color:${color.ink2}}
.mj-stat em{display:block;font-style:normal;font-family:${font.uiMedium};font-size:12px;color:${color.muted};text-transform:uppercase;letter-spacing:.12em}
.mj-ping{position:relative;display:flex;gap:10px;align-items:flex-start;margin-top:14px;padding:10px 12px;border-radius:14px;background:${color.canvas};border:1px solid ${color.lineSoft};min-height:44px}
.mj-ping .z{flex:0 0 auto;width:26px;height:26px;border-radius:8px;background:${color.zalo};color:${color.white};font-family:${font.uiSemiBold};font-size:13px;display:flex;align-items:center;justify-content:center}
.mj-ping .n{font-family:${font.ui};font-size:15px;line-height:1.35;color:${color.ink}}
.mj-ping .n small{display:block;font-size:12px;color:${color.muted}}
.mj-ping .c{position:absolute;top:-8px;right:-6px;min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;border-radius:11px;background:${color.danger};color:${color.white};font-family:${font.uiSemiBold};font-size:12px;display:flex;align-items:center;justify-content:center}
.mj-ping .n span{display:block}
.mj-s.on .mj-ping .n span{animation:mjPing 520ms ${EASE} both}
@keyframes mjPing{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:none}}
.mj-gains{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
.mj-gain{border-radius:14px;background:${color.canvas};border:1px solid ${color.lineSoft};padding:10px}
.mj-gain b{display:block;white-space:nowrap;font-family:${font.display};font-size:clamp(19px,5.6vw,24px);line-height:1;letter-spacing:-.02em;background:${cssGradient(gradient.glowSoft)};-webkit-background-clip:text;background-clip:text;color:transparent}
.mj-gain span{display:block;margin-top:4px;font-family:${font.ui};font-size:13px;line-height:1.3;color:${color.ink2}}
.mj-toast{align-self:flex-start;display:flex;gap:10px;align-items:center;max-width:100%;box-sizing:border-box;margin-bottom:10px;padding:10px 14px 10px 10px;border-radius:16px;background:rgba(34,16,36,.92);color:${color.white};font-family:${font.ui};font-size:14px;line-height:1.35;box-shadow:0 12px 30px rgba(34,16,36,.3);transition:opacity ${String(SLOW)}ms ${EASE},transform ${String(SLOW)}ms ${EASE}}
.mj-toast i{flex:0 0 auto;width:26px;height:26px;border-radius:13px;background:${cssGradient(gradient.glowSoft)};color:${color.ink};font-style:normal;font-family:${font.uiSemiBold};font-size:14px;display:flex;align-items:center;justify-content:center}
.mj-toast small{display:block;font-size:12px;color:${color.lilac300}}
.mj-s .mj-toast.later{opacity:0;transform:translate3d(0,-10px,0)}
.mj-s.on .mj-toast.later{opacity:1;transform:none;transition-delay:1300ms}

/* screenshots: one focused crop, tap to zoom */
.mj-shot{position:relative;margin:0 0 12px;padding:0;border:1px solid ${color.lineSoft};border-radius:18px;background:${color.white};box-shadow:0 18px 44px rgba(42,20,38,.16);overflow:hidden;display:block;width:100%;text-align:left;cursor:zoom-in;font:inherit;color:inherit}
.mj-shot figcaption,.mj-shot .cap{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;font-family:${font.uiSemiBold};font-size:13px;line-height:1.3;color:${color.ink};border-bottom:1px solid ${color.lineSoft}}
.mj-shot .cap em{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;font-style:normal;font-family:${font.uiMedium};font-size:12px;color:${color.lilac700}}
.mj-shot .img{position:relative;display:block;max-height:var(--shot-h,40svh);overflow:hidden}
.mj-shot .img img{display:block;width:100%;height:auto}
.mj-shot .img::after{content:"";position:absolute;left:0;right:0;bottom:0;height:28px;background:linear-gradient(180deg,rgba(255,255,255,0),${color.white});pointer-events:none}
.mj-shot.full .img::after{display:none}
.mj-call{position:absolute;left:10px;bottom:10px;z-index:1;display:inline-flex;align-items:center;gap:6px;max-width:calc(100% - 20px);box-sizing:border-box;padding:7px 10px;border-radius:12px;background:${color.ink};color:${color.white};font-family:${font.uiMedium};font-size:13px;line-height:1.25;box-shadow:0 8px 20px rgba(34,16,36,.25)}
.mj-call i{font-style:normal;color:${color.pink300};font-size:9px}

/* facts / office pages on a soft veil */
.mj-n{font-family:${font.display};font-size:46px;line-height:1;letter-spacing:-.03em;background:${cssGradient(gradient.glowSoft)};-webkit-background-clip:text;background-clip:text;color:transparent;margin:0 0 4px}
.mj-k{font-family:${font.uiSemiBold};font-size:18px;line-height:1.3;margin:0;color:${color.ink}}
.mj-pain{display:flex;gap:8px;margin:10px 0 0;font-family:${font.ui};font-size:14px;line-height:1.45;color:${color.muted}}
.mj-pain i{font-style:normal;color:${color.danger}}
.mj-pain em{font-style:normal;font-family:${font.uiMedium};color:${color.ink2};margin-right:4px}
.mj-list{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.mj-list li{display:flex;gap:10px;font-family:${font.ui};font-size:16px;line-height:1.4;color:${color.ink2}}
.mj-list li i{flex:0 0 auto;width:22px;height:22px;margin-top:1px;border-radius:11px;background:${color.lilac100};color:${color.lilac700};font-style:normal;font-size:12px;display:flex;align-items:center;justify-content:center}
.mj-s.plain{justify-content:center}
.mj-s.plain .mj-card{box-shadow:0 14px 40px rgba(42,20,38,.12)}

/* earnings card: big touch sliders (a slider drag never scrolls the page) */
.mj .calc{padding:18px}
.mj .calc-t{font-size:18px;line-height:1.3}
.mj .calc-r{margin-top:16px}
.mj .calc-r span{font-size:15px;color:${color.ink2}}
.mj .calc-r input{height:44px;margin:4px 0 0;touch-action:none;-webkit-appearance:none;appearance:none;background:transparent}
.mj .calc-r input::-webkit-slider-runnable-track{height:8px;border-radius:4px;background:${color.lilac100}}
.mj .calc-r input::-webkit-slider-thumb{-webkit-appearance:none;width:32px;height:32px;margin-top:-12px;border-radius:16px;background:${color.white};border:3px solid ${color.lilac500};box-shadow:0 4px 12px rgba(42,20,38,.2)}
.mj .calc-r input::-moz-range-track{height:8px;border-radius:4px;background:${color.lilac100}}
.mj .calc-r input::-moz-range-thumb{width:28px;height:28px;border-radius:16px;background:${color.white};border:3px solid ${color.lilac500}}
.mj .calc-out b{font-size:44px}
.mj .calc-out span{font-size:15px}
.mj .calc-year{font-size:15px}
.mj .calc-note{font-size:12px}
.mj .calc-note a{display:inline-block;padding:6px 0}

/* switching: the price list becomes services */
.mj-sw{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.mj-sw .paper{display:grid;grid-template-columns:1fr 1fr;column-gap:14px;padding:10px 12px;border-radius:12px;background:${color.paper};border:1px solid ${color.paperLine};font-family:${font.script};font-size:16px;line-height:1.3;color:${color.ink2};transform:rotate(-1.2deg)}
.mj-sw .arr{display:flex;align-items:center;gap:8px;font-family:${font.uiMedium};font-size:13px;color:${color.lilac700}}
.mj-sw .arr b{font-family:${font.uiSemiBold};font-weight:400;font-size:18px}
.mj-sw .svc{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.mj-sw .row{display:flex;flex-direction:column;gap:1px;padding:7px 10px;border-radius:10px;background:${color.white};border:1px solid ${color.lineSoft};font-family:${font.ui};font-size:14px;line-height:1.25;color:${color.ink}}
.mj-sw .row b{font-family:${font.uiSemiBold};font-weight:400}
.mj-sw .row em{font-style:normal;font-size:13px;color:${color.muted};white-space:nowrap}
.mj-s .mj-sw .row{opacity:0;transform:translate3d(0,10px,0)}
.mj-s.on .mj-sw .row{opacity:1;transform:none;transition:opacity ${String(SLOW)}ms ${EASE},transform ${String(SLOW)}ms ${EASE};transition-delay:calc(500ms + var(--i) * 140ms)}
@media (max-height:700px){.mj-sw .paper{display:none}}
.mj-sw .done{font-family:${font.uiMedium};font-size:12px;color:${color.lilac700}}
.mj-steps{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.mj-steps li{display:flex;gap:10px;align-items:flex-start;font-family:${font.ui};font-size:16px;line-height:1.4;color:${color.ink2}}
.mj-steps b{flex:0 0 auto;width:24px;height:24px;border-radius:12px;background:${color.ink};color:${color.white};font-family:${font.uiSemiBold};font-weight:400;font-size:13px;display:flex;align-items:center;justify-content:center}

/* entrance of the card content when a section is reached */
.mj-s .mj-in{opacity:0;transform:translate3d(0,16px,0)}
.mj-s.on .mj-in{opacity:1;transform:none;transition:opacity ${String(SLOW)}ms ${EASE},transform ${String(SLOW)}ms ${EASE};transition-delay:calc(var(--i,0) * 60ms)}

/* perspectives: scroll-advanced full-screen chats (one snap = one step) */
.mc-track{position:relative}
.mc-mk{position:absolute;left:0;width:100%;height:100svh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.mc-pin{position:sticky;top:0;height:100svh;display:flex;flex-direction:column;box-sizing:border-box;padding-top:var(--bar);overflow:hidden}
.mc-client .mc-pin{background:${color.zaloChat}}
.mc-ai .mc-pin{background:${color.canvas}}
.mc-copy{position:relative;z-index:2;margin:6px var(--pad) 8px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 10px 30px rgba(42,20,38,.12)}
.mc-copy .mj-eye{margin-bottom:2px}
.mc-stepc{display:grid}
.mc-stepc>*{grid-area:1/1}
.mc-ghost{visibility:hidden}
.mc-live b,.mc-ghost b{display:block;font-family:${font.uiSemiBold};font-weight:400;font-size:17px;line-height:1.3;color:${color.ink}}
.mc-live p,.mc-ghost p{margin:4px 0 0;font-family:${font.ui};font-size:15px;line-height:1.45;color:${color.ink2}}
.mc-live .n,.mc-ghost .n{font-family:${font.uiSemiBold};font-size:12px;color:${color.lilac700};letter-spacing:.08em}
.mc-live>*{animation:mcIn ${String(SLOW)}ms ${EASE} both}
.mc-live>*:nth-child(2){animation-delay:60ms}
.mc-live>*:nth-child(3){animation-delay:120ms}
@keyframes mcIn{from{opacity:0;transform:translate3d(0,16px,0)}to{opacity:1;transform:none}}
.mc-dots{display:flex;gap:4px;margin-top:8px}
.mc-dots i{flex:1;height:3px;border-radius:2px;background:rgba(34,16,36,.12)}
.mc-dots i.on{background:${cssGradient(gradient.glowSoft)}}
.mc-app{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;background:${color.white};border-radius:22px 22px 0 0;box-shadow:0 -8px 30px rgba(42,20,38,.08);overflow:hidden}
.mc-client .mc-app{background:${color.zaloChat}}
.mc-top{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:10px 14px;background:${color.white};border-bottom:1px solid ${color.lineSoft}}
.mc-client .mc-top{background:${color.zalo};color:${color.white};border-bottom:0}
.mc-top .back{font-size:24px;line-height:1;width:18px}
.mc-ava{position:relative;flex:0 0 auto;width:38px;height:38px;border-radius:19px;background:${color.lilac300};color:${color.ink};font-style:normal;font-family:${font.uiSemiBold};font-size:14px;display:flex;align-items:center;justify-content:center}
.mc-ava em{position:absolute;right:-6px;bottom:-4px;padding:1px 4px;border-radius:6px;background:${color.white};color:${color.zalo};font-style:normal;font-size:9px;font-family:${font.uiSemiBold}}
.mc-who{min-width:0}
.mc-who b{display:block;font-family:${font.uiSemiBold};font-weight:400;font-size:16px;line-height:1.2}
.mc-who small{display:block;font-family:${font.ui};font-size:12.5px;opacity:.85}
.mc-plan{margin-left:6px;padding:1px 6px;border-radius:6px;background:${color.lilac100};color:${color.lilac700};font-style:normal;font-size:11px}
.mc-log{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 12px 8px;display:flex;flex-direction:column;gap:8px;scrollbar-width:none}
.mc-log::-webkit-scrollbar{display:none}
.mc-day{align-self:center;padding:3px 10px;border-radius:10px;background:rgba(34,16,36,.1);font-family:${font.ui};font-size:12px;color:${color.ink2}}
.mc-msg{display:flex;gap:8px;max-width:86%;animation:mcMsg 260ms ${EASE} both}
.mc-msg.me{align-self:flex-end;flex-direction:row-reverse}
.mc-msg.sys{align-self:center;max-width:100%}
.mc-msg.has-viz{max-width:100%;width:100%}
@keyframes mcMsg{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}
.mc-col{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1 1 auto}
.mc-msg.me .mc-col{align-items:flex-end}
.mc-bub{padding:9px 12px;border-radius:16px;background:${color.white};font-family:${font.ui};font-size:16px;line-height:1.4;color:${color.ink};white-space:pre-line;box-shadow:0 1px 2px rgba(34,16,36,.06)}
.mc-msg.me .mc-bub{background:${color.zaloSent}}
.mc-ai .mc-msg.me .mc-bub{background:${color.ink};color:${color.white}}
.mc-ai .mc-msg.them .mc-bub{background:${color.tile}}
.mc-msg.staff .mc-bub{border:1px solid ${color.lilac300}}
.mc-msg.sys .mc-bub{background:rgba(34,16,36,.1);font-size:12.5px;padding:3px 10px;box-shadow:none;color:${color.ink2}}
.mc-msg.card .mc-bub{border-left:4px solid ${color.zalo}}
.mc-gu{flex:0 0 auto;width:30px;height:30px;border-radius:15px;background:${cssGradient(gradient.glowSoft)};color:${color.ink};font-family:${font.uiSemiBold};font-size:12px;display:flex;align-items:center;justify-content:center}
.mc-btns{display:flex;flex-wrap:wrap;gap:6px}
.mc-btns span{padding:7px 12px;border-radius:16px;background:${color.white};border:1px solid ${color.zalo};color:${color.zalo};font-family:${font.uiMedium};font-size:14px}
.mc-time{font-family:${font.ui};font-size:11.5px;color:${color.muted}}
.mc-src{display:inline-flex;align-items:center;gap:6px;font-family:${font.uiMedium};font-size:12px;color:${color.lilac700}}
.mc-src i{width:6px;height:6px;border-radius:3px;background:${color.lilac500}}
.mc-viz{margin-top:10px}
.mc-viz .av-tile b{font-size:20px}
.mc-viz .av-tile small,.mc-viz .av-row,.mc-viz .av-week em{font-size:13px}
.mc-viz .av-tiles{grid-template-columns:repeat(2,1fr)}
.mc-viz .av-week{height:72px}
.mc-viz .av-rev b{font-size:18px}
.mc-viz .av-rev small,.mc-viz .av-rev em{font-size:12.5px}
.mc-typing{display:flex;gap:4px;align-items:center;min-height:22px}
.mc-typing i{width:7px;height:7px;border-radius:4px;background:${color.muted};animation:mcDot 1s infinite ease-in-out both}
.mc-typing i:nth-child(2){animation-delay:.15s}.mc-typing i:nth-child(3){animation-delay:.3s}
.mc-typing span{margin-left:6px;font-family:${font.ui};font-size:13px;color:${color.muted}}
@keyframes mcDot{0%,80%,100%{opacity:.3;transform:none}40%{opacity:1;transform:translate3d(0,-3px,0)}}
.mc-input{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));background:${color.white};border-top:1px solid ${color.lineSoft}}
.mc-input .f{flex:1;min-width:0;height:38px;border-radius:19px;background:${color.tile};display:flex;align-items:center;padding:0 14px;font-family:${font.ui};font-size:15px;color:${color.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-input .s{width:38px;height:38px;border-radius:19px;background:${color.zalo};color:${color.white};display:flex;align-items:center;justify-content:center;font-size:18px}
.mc-ai .mc-input .s{background:${color.ink}}
.mc-privacy{margin:0;padding:0 14px 8px;background:${color.white};font-family:${font.ui};font-size:12px;line-height:1.4;color:${color.muted}}
.mc-note{margin:6px 0 0;font-family:${font.ui};font-size:12px;line-height:1.4;color:${color.muted}}
/* GuGu Studio toasts: what the salon's system just did */
.mc-toast{position:absolute;left:12px;right:12px;top:66px;z-index:3;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:16px;background:rgba(34,16,36,.94);color:${color.white};font-family:${font.ui};font-size:14px;line-height:1.3;box-shadow:0 14px 34px rgba(34,16,36,.32);animation:mcToast 2600ms ${EASE} both}
.mc-toast i{flex:0 0 auto;width:28px;height:28px;border-radius:9px;background:${cssGradient(gradient.glowSoft)};display:flex;align-items:center;justify-content:center;font-style:normal;font-family:${font.uiSemiBold};font-size:12px;color:${color.ink}}
.mc-toast small{display:block;font-size:11.5px;color:${color.lilac300}}
@keyframes mcToast{0%{opacity:0;transform:translate3d(0,-14px,0)}10%,85%{opacity:1;transform:none}100%{opacity:0;transform:translate3d(0,-8px,0)}}
.mc-hint{position:absolute;left:50%;bottom:calc(64px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:3;padding:6px 12px;border-radius:14px;background:rgba(34,16,36,.8);color:${color.white};font-family:${font.uiMedium};font-size:13px;white-space:nowrap;pointer-events:none;animation:mcHint 2400ms ${EASE} 1200ms both}
@keyframes mcHint{0%{opacity:0;transform:translate(-50%,8px)}15%,80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,0)}}

/* tap-to-zoom viewer (appended to <body>) */
.mj-zoom{position:fixed;inset:0;z-index:1000;background:rgba(34,16,36,.94);display:flex;flex-direction:column;opacity:0;transition:opacity ${String(motion.duration.base)}ms ${EASE};touch-action:none}
.mj-zoom.open{opacity:1}
.mj-zoom .zbar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(8px + env(safe-area-inset-top,0px)) 8px 8px 16px;color:${color.white};font-family:${font.uiSemiBold};font-size:15px}
.mj-zoom .zbar small{display:block;font-family:${font.ui};font-size:12px;color:${color.lilac300}}
.mj-zbtn{flex:0 0 auto;min-width:44px;height:44px;padding:0 14px;border:0;border-radius:22px;background:rgba(255,255,255,.14);color:${color.white};font-family:${font.uiSemiBold};font-size:15px;cursor:pointer}
.mj-zoom .zstage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center}
.mj-zoom .zstage img{max-width:100%;max-height:100%;width:auto;height:auto;transform-origin:0 0;will-change:transform;border-radius:10px;background:${color.white};user-select:none;-webkit-user-drag:none}

/* short phones (360×640, 375×667): tighter cards, fewer list lines */
@media (orientation:portrait) and (max-height:700px){
  .mj-h{font-size:clamp(26px,7.6vw,32px)}
  .mj-card{padding:14px 14px 12px}
  .mj-card .mj-tag+.mj-eye{display:none}
  .mj-ping .n span+span{display:none}
  .mj-stat b{font-size:46px}
  .mj-list li:nth-child(n+3){display:none}
  .mj-go{min-height:44px;margin-top:10px}
  .mj-gains{margin-top:10px}
  .mc-copy{padding:10px 12px;margin-bottom:6px}
  .mc-note{display:none}
  .mj-s[data-sec="pay"] .mj-shot .img,.mj-s[data-sec="ins"] .mj-shot .img{max-height:24svh}
}
/* landscape phones: compact, copy beside the picture */
@media (orientation:landscape) and (max-height:520px){
  .mj{--bar:44px}
  .mj .jr-static .jr-frame,.mj .jr-plaque{display:none}
  .mj-s{flex-direction:row;align-items:flex-end;justify-content:flex-end;gap:12px;padding:calc(var(--bar) + 6px) max(var(--pad),env(safe-area-inset-right,0px)) 12px max(var(--pad),env(safe-area-inset-left,0px))}
  .mj-s>.mj-card{width:min(440px,52%)}
  .mj-s.plain{flex-direction:row;align-items:center;justify-content:center}
  .mj-s.plain>.mj-shot,.mj-s.plain>.mj-shotwrap{flex:1 1 0;min-width:0;margin:0;--shot-h:calc(100svh - var(--bar) - 40px)}
  .mj-s.plain>.mj-card{flex:1 1 0;min-width:0;max-width:440px}
  .mj-h{font-size:28px}
  .mj-stat b{font-size:40px}
  .mj-toast{position:absolute;left:var(--pad);top:calc(var(--bar) + 8px);max-width:40%}
  .mc-pin{flex-direction:row}
  .mc-copy{flex:0 0 38%;align-self:flex-start;margin:6px 8px 8px var(--pad)}
  .mc-app{border-radius:18px 18px 0 0;margin-right:var(--pad)}
}
@media (prefers-reduced-motion:reduce){
  .mj *,.mj *::before,.mj *::after{animation:none!important;transition:none!important}
  .mj-s .mj-in,.mj-s .mj-sw .row,.mj-s .mj-toast.later{opacity:1;transform:none}
  .mj-bg .mj-after-img{clip-path:none}
  .mj-edge{display:none}
  .mc-toast{opacity:1}
  .mc-hint{display:none}
  .mj-zoom{transition:none}
}
}
`;

/** Long-press / drag duration hints for the walk playback (ms). */
export const WALK_MS = 2600;
export const DELIBERATE = DELIB;
