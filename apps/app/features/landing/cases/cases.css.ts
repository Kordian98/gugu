import {
  color,
  cssGradient,
  font,
  gradient,
  motion,
  radius,
  shadow,
  space,
  typeScale as ty,
} from "@gugu/design-system";

/**
 * Case studies (illustrative salons). `.cx.d` desktop: tabs, one story at a time (setup + map left, real
 * CRM screen right, three outcomes across); the panels share one grid cell so a tab switch never moves
 * the page. `.cx.m` phones: a swipe carousel, one story per screen, the track height follows the
 * current story. The map: the tangle of old tools (wires crawl, notes wobble) gives way to the GuGu
 * Studio flow (nodes pop in one by one, arrows draw on). Only transform / opacity / stroke-dashoffset
 * animate; reduced motion shows the final state with no movement. Text is ink / ink2 / body on white,
 * canvas or paper (AA); the gradient is only on two headline words.
 */
const EASE = motion.ease.out;
const D = motion.duration;
const ms = (n: number) => `${String(n)}ms`;
const px = (n: number) => `${String(n)}px`;
/** Pause on the "before" tangle before the GuGu Studio flow takes over (ms, also used by the player). */
export const MAP_HOLD_MS = D.deliberate * 2 + D.slow;

export const CASES_CSS = `
.cx{position:relative;box-sizing:border-box;width:100%;max-width:1240px;margin:0 auto;padding:clamp(72px,10vh,128px) ${px(space[10])} ${px(space[8])};color:${color.ink}}
.cx *,.cx *::before,.cx *::after{box-sizing:border-box}
.cx-head{max-width:820px}
.cx-head .fl-h{margin-bottom:.2em}
.cx-glow{background:${cssGradient(gradient.glowSoft)};-webkit-background-clip:text;background-clip:text;color:transparent}
.cx-sub{font-family:${font.ui};font-size:${px(ty.lead)};line-height:1.5;color:${color.ink2};margin:0;max-width:640px;text-wrap:pretty}
.cx-label{display:inline-flex;align-items:center;gap:${px(space[2])};margin:${px(space[4])} 0 0;padding:${px(space[2])} ${px(space[3])};border-radius:${px(radius.pill)};background:${color.paper};border:1px solid ${color.paperLine};font-family:${font.uiMedium};font-size:${px(ty.label)};line-height:1.35;color:${color.ink2}}
.cx-label i{flex:0 0 auto;width:20px;height:20px;border-radius:${px(radius.pill)};border:1.5px solid ${color.ink2};font-style:normal;font-family:${font.uiSemiBold};font-size:${px(ty.micro)};line-height:17px;text-align:center}

/* tabs (desktop) / story pills (phones) */
.cx-tabs{display:flex;gap:${px(space[2])};margin:${px(space[8])} 0 ${px(space[6])};padding:0;list-style:none}
.cx-tab{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;min-height:56px;padding:${px(space[2])} ${px(space[5])};border:1px solid ${color.lineStrong};border-radius:${px(radius.md)};background:${color.white};color:${color.ink};font-family:${font.uiSemiBold};font-size:${px(ty.body)};line-height:1.2;text-align:left;cursor:pointer;transition:background ${ms(D.base)} ${EASE},border-color ${ms(D.base)} ${EASE},color ${ms(D.base)} ${EASE}}
.cx-tab small{font-family:${font.ui};font-size:${px(ty.micro)};color:${color.body};transition:color ${ms(D.base)} ${EASE}}
.cx-tab:hover{border-color:${color.lilac300}}
.cx-tab[aria-selected="true"],.cx-tab[aria-current="true"]{background:${color.ink};border-color:${color.ink};color:${color.white}}
.cx-tab[aria-selected="true"] small,.cx-tab[aria-current="true"] small{color:${color.lilac300}}
.cx-tab:focus-visible,.cx-tg button:focus-visible,.cx-pg button:focus-visible{outline:2px solid ${color.lilac500};outline-offset:2px}

/* one story */
.cx-panels{position:relative}
.cx.d .cx-panels{display:grid}
.cx.d .cx-story{grid-area:1/1}
.cx.d .cx-story[aria-hidden="true"]{visibility:hidden;opacity:0;pointer-events:none}
.cx.d .cx-story.on{animation:cxIn ${ms(D.slow)} ${EASE} both}
@keyframes cxIn{from{opacity:0;transform:translate3d(0,12px,0)}to{opacity:1;transform:none}}
.cx-story{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);column-gap:clamp(32px,4vw,64px);row-gap:${px(space[8])};align-items:start}
.cx-text{min-width:0}
.cx-type{font-family:${font.uiMedium};font-size:${px(ty.micro)};letter-spacing:.22em;text-transform:uppercase;color:${color.eyebrow}}
.cx-name{font-family:${font.display};font-weight:400;font-size:clamp(32px,3.4vw,${px(ty.stat)});line-height:1.06;letter-spacing:-.03em;margin:${px(space[2])} 0 ${px(space[3])};text-wrap:balance}
.cx-name:focus{outline:none}
.cx-setup{font-family:${font.ui};font-size:${px(ty.body)};line-height:1.55;color:${color.ink2};margin:0;max-width:52ch;text-wrap:pretty}

/* the before → after map */
.cx-map{position:relative;margin:${px(space[6])} 0 0;border-radius:${px(radius.lg)};background:${color.canvas};border:1px solid ${color.lineSoft};overflow:hidden}
.cx-mh{display:flex;align-items:center;justify-content:space-between;gap:${px(space[2])};padding:${px(space[2])} ${px(space[2])} 0 ${px(space[4])}}
.cx-dia{position:relative;aspect-ratio:320/150}
.cx-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cx-tangle path{fill:none;stroke:${color.dangerInk};stroke-width:1.5;stroke-linecap:round;stroke-dasharray:4 6;opacity:.5;transition:opacity ${ms(D.deliberate)} ${EASE};animation:cxAnts 1.4s linear infinite}
@keyframes cxAnts{to{stroke-dashoffset:-20}}
.cx-flow path{fill:none;stroke:${color.lilac700};stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset ${ms(D.deliberate)} ${EASE};transition-delay:0ms}
.cx-map.after .cx-tangle path{opacity:0;animation:none}
.cx-map.after .cx-flow path{stroke-dashoffset:0;transition-delay:calc(var(--i) * ${ms(D.slow)} + ${ms(D.slow)})}
.cx-nodes{list-style:none;margin:0;padding:0}
.cx-g{width:18px;height:18px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.cx-nodes.b li{position:absolute;display:flex;align-items:center;gap:6px;max-width:44%;padding:6px 10px;border-radius:${px(radius.sm)};background:${color.paper};border:1px solid ${color.paperLine};box-shadow:${shadow.hair};font-family:${font.uiMedium};font-size:${px(ty.caption)};line-height:1.25;color:${color.ink2};transform:translate(-50%,-50%) rotate(var(--r));transition:opacity ${ms(D.slow)} ${EASE},transform ${ms(D.deliberate)} ${EASE};animation:cxWob 2.6s ease-in-out infinite alternate;animation-delay:calc(var(--i) * -700ms)}
.cx-nodes.b li .cx-g{color:${color.dangerInk}}
@keyframes cxWob{from{rotate:0deg}to{rotate:2deg}}
.cx-map.after .cx-nodes.b li{opacity:0;transform:translate(-50%,-50%) rotate(var(--r)) scale(.85);animation:none}
.cx-nodes.a li{position:absolute;top:calc(42% - 22px);width:25%;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 4px;text-align:center;font-family:${font.uiSemiBold};font-size:${px(ty.caption)};line-height:1.25;color:${color.ink};opacity:0;transform:translate(-50%,10px) scale(.9);transition:opacity ${ms(D.slow)} ${EASE},transform ${ms(D.slow)} ${EASE}}
.cx-nodes.a .d{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:${px(radius.pill)};background:${color.white};border:1.5px solid ${color.lilac500};box-shadow:${shadow.soft};color:${color.lilac700}}
.cx-nodes.a li:last-child .d{background:${color.ink};border-color:${color.ink};color:${color.white}}
.cx-map.after .cx-nodes.a li{opacity:1;transform:translate(-50%,0);transition-delay:calc(var(--i) * ${ms(D.slow)})}
.cx-tags{display:grid}
.cx-tags>*{grid-area:1/1;justify-self:start}
.cx-tag{padding:4px 10px;border-radius:${px(radius.pill)};font-family:${font.uiSemiBold};font-size:${px(ty.micro)};line-height:1.3;transition:opacity ${ms(D.slow)} ${EASE}}
.cx-tag.b{background:${color.dangerTint};color:${color.dangerInk}}
.cx-tag.a{background:${color.lilac100};color:${color.ink2};opacity:0}
.cx-map.after .cx-tag.b{opacity:0}
.cx-map.after .cx-tag.a{opacity:1}
.cx-tg{flex:0 0 auto;display:inline-flex;gap:2px;padding:3px;border-radius:${px(radius.pill)};background:${color.tile};border:1px solid ${color.lineSoft}}
.cx-tg button{min-height:44px;min-width:64px;padding:0 ${px(space[4])};border:0;border-radius:${px(radius.pill)};background:transparent;color:${color.ink2};font-family:${font.uiSemiBold};font-size:${px(ty.label)};cursor:pointer;transition:background ${ms(D.base)} ${EASE},color ${ms(D.base)} ${EASE}}
.cx-tg button[aria-pressed="true"]{background:${color.white};color:${color.ink};box-shadow:${shadow.hair}}

/* outcomes: small elegant type, the number inline, the feature behind it */
.cx-outs{grid-column:1/-1;list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(20px,3vw,40px)}
.cx-outs li{padding-top:${px(space[4])};border-top:1px solid ${color.line}}
.cx-outs .n{display:block;font-family:${font.uiMedium};font-size:${px(ty.micro)};letter-spacing:.2em;color:${color.eyebrow};margin-bottom:${px(space[2])}}
.cx-outs p{margin:0;font-family:${font.ui};font-size:${px(ty.body)};line-height:1.5;color:${color.ink2};text-wrap:pretty}
.cx-outs b{font-family:${font.serifBold};font-weight:400;font-size:${px(ty.title)};line-height:1.2;letter-spacing:-.01em;color:${color.ink};font-variant-numeric:tabular-nums;white-space:nowrap}
.cx-outs .f{display:flex;align-items:center;gap:6px;margin-top:${px(space[2])};font-family:${font.uiMedium};font-size:${px(ty.caption)};line-height:1.35;color:${color.eyebrow}}
.cx-outs .f::before{content:"";flex:0 0 auto;width:6px;height:6px;border-radius:${px(radius.pill)};background:${color.lilac500}}
.cx-assume{grid-column:1/-1;margin:-${px(space[4])} 0 0;font-family:${font.ui};font-size:${px(ty.micro)};line-height:1.5;color:${color.body};max-width:900px}

/* the real screen */
.cx-shot{margin:0;border-radius:${px(radius.lg)};background:${color.white};border:1px solid ${color.lineSoft};box-shadow:${shadow.soft};overflow:hidden}
.cx-shot .img{display:block;position:relative;overflow:hidden}
.cx-shot img{display:block;width:100%;height:auto}
.cx.d .cx-shot img{width:var(--z,100%);max-width:none}
/* a zoomed crop fades out at its cut edges */
.cx.d .cx-shot .img.z::after{content:"";position:absolute;right:0;top:0;bottom:0;width:40px;background:linear-gradient(90deg,rgba(255,255,255,0),${color.white});pointer-events:none}
.cx-shot figcaption{display:flex;flex-direction:column;gap:2px;padding:${px(space[3])} ${px(space[4])};border-top:1px solid ${color.lineSoft}}
.cx-shot figcaption b{font-family:${font.uiSemiBold};font-weight:400;font-size:${px(ty.label)};line-height:1.35;color:${color.ink}}
.cx-shot figcaption small{font-family:${font.ui};font-size:${px(ty.micro)};line-height:1.4;color:${color.body}}

/* phones: one story per screen, swipe between them */
.cx.m{padding:${px(space[10] + space[6])} 0 ${px(space[8])}}
.cx.m .cx-head{padding:0 ${px(space[4])}}
.cx.m .fl-h{font-size:clamp(32px,9vw,${px(ty.stat)})}
.cx.m .cx-sub{font-size:${px(ty.body)}}
.cx.m .cx-tabs{margin:${px(space[6])} 0 ${px(space[4])};padding:0 ${px(space[4])};overflow-x:auto;scrollbar-width:none;scroll-padding:0 ${px(space[4])}}
.cx.m .cx-tabs::-webkit-scrollbar{display:none}
.cx.m .cx-tab{flex:0 0 auto;min-height:44px;padding:0 ${px(space[4])};border-radius:${px(radius.pill)};font-size:${px(ty.label)}}
.cx.m .cx-tab small{display:none}
.cx.m .cx-panels{display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none;align-items:flex-start;transition:height ${ms(D.slow)} ${EASE}}
.cx.m .cx-panels::-webkit-scrollbar{display:none}
.cx.m .cx-story{flex:0 0 100%;display:flex;flex-direction:column;gap:0;padding:0 ${px(space[4])};scroll-snap-align:start;scroll-snap-stop:always}
.cx.m .cx-name{font-size:clamp(30px,8.4vw,${px(ty.display)})}
.cx.m .cx-map{margin-top:${px(space[5])}}
.cx.m .cx-dia{aspect-ratio:320/200}
.cx.m .cx-mh{padding-left:${px(space[3])}}
.cx.m .cx-nodes.b li{font-size:${px(ty.micro)};padding:5px 8px;gap:5px}
.cx.m .cx-nodes.a li{font-size:${px(ty.micro)};top:calc(40% - 22px)}
.cx.m .cx-g{width:16px;height:16px}
.cx.m .cx-nodes.a .d .cx-g{width:18px;height:18px}
.cx.m .cx-outs{grid-template-columns:1fr;gap:0;margin-top:${px(space[5])}}
.cx.m .cx-outs li{padding:${px(space[4])} 0}
.cx.m .cx-outs .n{display:none}
.cx.m .cx-shot{margin-top:${px(space[5])}}
.cx.m .cx-shot .img{max-height:62svh}
.cx.m .cx-shot .img::after{content:"";position:absolute;left:0;right:0;bottom:0;height:32px;background:linear-gradient(180deg,rgba(255,255,255,0),${color.white});pointer-events:none}
.cx.m .cx-assume{margin:${px(space[3])} 0 0}
.cx-pg{display:flex;align-items:center;justify-content:center;gap:${px(space[4])};margin-top:${px(space[6])};padding:0 ${px(space[4])}}
.cx-pg button{width:48px;height:48px;border-radius:${px(radius.pill)};border:1px solid ${color.lineStrong};background:${color.white};color:${color.ink};font-family:${font.uiSemiBold};font-size:${px(ty.lead)};line-height:1;cursor:pointer}
.cx-pg button:disabled{opacity:.4;cursor:default}
.cx-pg span{min-width:12ch;text-align:center;font-family:${font.uiMedium};font-size:${px(ty.label)};color:${color.ink2};font-variant-numeric:tabular-nums}

@media (prefers-reduced-motion:reduce){
  .cx *,.cx *::before,.cx *::after{animation:none!important;transition:none!important}
}
`;
