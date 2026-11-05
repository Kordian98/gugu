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
  space,
  typeScale as ty,
} from "@gugu/design-system";

/**
 * Case studies (illustrative salons). `.cx.d` desktop: tabs, one story at a time (setup + map left, a
 * stack of real CRM screens right, three outcomes across); the panels share one grid cell so a tab
 * switch never moves the page. `.cx.m` phones: a swipe carousel, one story per screen, the track height
 * follows the current story. The map is manual: the salon's own old way (paper notes, crawling wires,
 * the wire that goes wrong in red) until "Sau" draws the GuGu Studio flow on. Only transform / opacity /
 * stroke-dashoffset animate; reduced motion shows the chosen state with no movement. Text is ink / ink2
 * / body on white, canvas or paper (AA); the gradient is only on two headline words.
 */
const EASE = motion.ease.out;
const D = motion.duration;
const ms = (n: number) => `${String(n)}ms`;
const px = (n: number) => `${String(n)}px`;
const S = (k: keyof typeof space) => px(space[k]);
/** Decorative loops of the old way (wires crawl, notes wobble), from the motion scale. */
const CRAWL = ms(D.deliberate * 3);
const WOBBLE = ms(D.deliberate * 5);
const BLUR_CHIP = `blur(${px(glass.blurChip)}) saturate(${String(glass.saturate)})`;

export const CASES_CSS = `
.cx{position:relative;box-sizing:border-box;width:100%;max-width:1240px;margin:0 auto;padding:clamp(72px,10vh,128px) ${S(10)} ${S(8)};color:${color.ink}}
.cx *,.cx *::before,.cx *::after{box-sizing:border-box}
.cx-head{max-width:820px}
.cx-head .fl-h{margin-bottom:.2em}
.cx-glow{background:${cssGradient(gradient.glowSoft)};-webkit-background-clip:text;background-clip:text;color:transparent}
.cx-sub{font-family:${font.ui};font-size:${px(ty.lead)};line-height:1.5;color:${color.ink2};margin:0;max-width:640px;text-wrap:pretty}
.cx-label{display:inline-flex;align-items:center;gap:${S(2)};margin:${S(4)} 0 0;padding:${S(2)} ${S(3)};border-radius:${px(radius.pill)};background:${color.paper};border:1px solid ${color.paperLine};font-family:${font.uiMedium};font-size:${px(ty.label)};line-height:1.35;color:${color.ink2}}
.cx-label i{flex:0 0 auto;width:${S(5)};height:${S(5)};border-radius:${px(radius.pill)};border:1.5px solid ${color.ink2};font-style:normal;font-family:${font.uiSemiBold};font-size:${px(ty.micro)};line-height:17px;text-align:center}

/* tabs (desktop) / story pills (phones) */
.cx-tabs{display:flex;gap:${S(2)};margin:${S(8)} 0 ${S(6)};padding:0;list-style:none}
.cx-tab{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:${S(1)};min-height:56px;padding:${S(2)} ${S(5)};border:1px solid ${color.lineStrong};border-radius:${px(radius.md)};background:${color.white};color:${color.ink};font-family:${font.uiSemiBold};font-size:${px(ty.body)};line-height:1.2;text-align:left;cursor:pointer;transition:background ${ms(D.base)} ${EASE},border-color ${ms(D.base)} ${EASE},color ${ms(D.base)} ${EASE}}
.cx-tab small{font-family:${font.ui};font-size:${px(ty.micro)};color:${color.body};transition:color ${ms(D.base)} ${EASE}}
.cx-tab:hover{border-color:${color.lilac300}}
.cx-tab[aria-selected="true"],.cx-tab[aria-current="true"]{background:${color.ink};border-color:${color.ink};color:${color.white}}
.cx-tab[aria-selected="true"] small,.cx-tab[aria-current="true"] small{color:${color.lilac300}}
.cx-tab:focus-visible,.cx-tg button:focus-visible,.cx-pg button:focus-visible,.cx-see:focus-visible,.cx-zoom:focus-visible{outline:2px solid ${color.lilac700};outline-offset:2px}

/* one story */
.cx-panels{position:relative}
.cx.d .cx-panels{display:grid}
.cx.d .cx-story{grid-area:1/1}
.cx.d .cx-story[aria-hidden="true"]{visibility:hidden;opacity:0;pointer-events:none}
.cx.d .cx-story.on{animation:cxIn ${ms(D.slow)} ${EASE} both}
@keyframes cxIn{from{opacity:0;transform:translate3d(0,12px,0)}to{opacity:1;transform:none}}
.cx-story{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);column-gap:clamp(32px,4vw,64px);row-gap:${S(8)};align-items:start}
.cx-text{min-width:0}
.cx-type{font-family:${font.uiMedium};font-size:${px(ty.micro)};letter-spacing:.22em;text-transform:uppercase;color:${color.eyebrow}}
.cx-name{font-family:${font.display};font-weight:400;font-size:clamp(32px,3.4vw,${px(ty.stat)});line-height:1.06;letter-spacing:-.03em;margin:${S(2)} 0 ${S(3)};text-wrap:balance}
.cx-name:focus{outline:none}
.cx-setup{font-family:${font.ui};font-size:${px(ty.body)};line-height:1.55;color:${color.ink2};margin:0;max-width:52ch;text-wrap:pretty}

/* the before → after map (manual) */
.cx-map{position:relative;margin:${S(6)} 0 0;border-radius:${px(radius.lg)};background:${color.canvas};border:1px solid ${color.lineSoft};overflow:hidden}
.cx-mh{display:flex;align-items:center;justify-content:space-between;gap:${S(2)};padding:${S(2)} ${S(2)} 0 ${S(4)}}
.cx-mt{display:grid;min-width:0;font-family:${font.uiSemiBold};font-size:${px(ty.label)};line-height:1.3;color:${color.ink2}}
.cx-mt>*{grid-area:1/1;transition:opacity ${ms(D.slow)} ${EASE}}
.cx-mt .a{opacity:0}
.cx-map.after .cx-mt .b{opacity:0}
.cx-map.after .cx-mt .a{opacity:1}
.cx-dia{position:relative;aspect-ratio:320/180}
.cx-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cx-tangle path{fill:none;stroke:${color.dangerInk};stroke-width:1.5;stroke-linecap:round;stroke-dasharray:4 6;opacity:.5;transition:opacity ${ms(D.deliberate)} ${EASE};animation:cxAnts ${CRAWL} linear infinite}
.cx-tangle path.bad{stroke-width:2.5;stroke-dasharray:none;opacity:.9;animation:none}
.cx-warn circle{fill:${color.dangerInk}}
.cx-warn text{fill:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.caption)}}
.cx-tangle{transition:opacity ${ms(D.deliberate)} ${EASE}}
@keyframes cxAnts{to{stroke-dashoffset:-20}}
.cx-flow path{fill:none;stroke:${color.lilac700};stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset ${ms(D.deliberate)} ${EASE};transition-delay:0ms}
.cx-map.after .cx-tangle{opacity:0}
.cx-map.after .cx-tangle path{animation:none}
.cx-map.after .cx-flow path{stroke-dashoffset:0;transition-delay:calc(var(--i) * ${ms(D.slow)} + ${ms(D.slow)})}
.cx-nodes{list-style:none;margin:0;padding:0}
.cx-g{width:18px;height:18px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.cx-nodes.b li{position:absolute;left:clamp(19%,var(--x),81%);top:clamp(12%,var(--y),88%);display:flex;align-items:center;gap:${S(2)};width:max-content;max-width:38%;padding:${S(2)} ${S(3)};border-radius:${px(radius.sm)};background:${color.paper};border:1px solid ${color.paperLine};box-shadow:${shadow.hair};font-family:${font.uiMedium};font-size:${px(ty.caption)};line-height:1.25;color:${color.ink2};transform:translate(-50%,-50%) rotate(var(--r));transition:opacity ${ms(D.slow)} ${EASE},transform ${ms(D.deliberate)} ${EASE};animation:cxWob ${WOBBLE} ease-in-out infinite alternate;animation-delay:calc(var(--i) * -${ms(D.deliberate + D.base)})}
.cx-nodes.b li .cx-g{color:${color.dangerInk}}
@keyframes cxWob{from{rotate:0deg}to{rotate:2deg}}
.cx-map.after .cx-nodes.b li{opacity:0;transform:translate(-50%,-50%) rotate(var(--r)) scale(.85);animation:none}
.cx-nodes.a li{position:absolute;top:calc(40% - 22px);width:25%;display:flex;flex-direction:column;align-items:center;gap:${S(2)};padding:0 ${S(1)};text-align:center;font-family:${font.uiSemiBold};font-size:${px(ty.caption)};line-height:1.25;color:${color.ink};opacity:0;transform:translate(-50%,10px) scale(.9);transition:opacity ${ms(D.slow)} ${EASE},transform ${ms(D.slow)} ${EASE}}
.cx-nodes.a .d{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:${px(radius.pill)};background:${color.white};border:1.5px solid ${color.lilac500};box-shadow:${shadow.soft};color:${color.lilac700}}
.cx-nodes.a li:last-child .d{background:${color.ink};border-color:${color.ink};color:${color.white}}
.cx-map.after .cx-nodes.a li{opacity:1;transform:translate(-50%,0);transition-delay:calc(var(--i) * ${ms(D.slow)})}
/* footer: "Xem sau" until the after map is shown, then the one line that says how it is solved */
.cx-mf{display:grid;padding:0 ${S(3)} ${S(3)}}
.cx-mf>*{grid-area:1/1}
.cx-fix{margin:0;padding:${S(3)} ${S(4)};border-radius:${px(radius.md)};background:${color.lilac100};font-family:${font.uiMedium};font-size:${px(ty.label)};line-height:1.4;color:${color.ink2};text-wrap:pretty;opacity:0;transform:translate3d(0,8px,0);transition:opacity ${ms(D.slow)} ${EASE},transform ${ms(D.slow)} ${EASE}}
.cx-fix{pointer-events:none}
.cx-map.after .cx-fix{opacity:1;transform:none;pointer-events:auto;transition-delay:${ms(D.slow * 4)}}
.cx-see{position:relative;z-index:1;justify-self:end;align-self:center;display:inline-flex;align-items:center;gap:${S(2)};min-height:44px;padding:0 ${S(4)};border:0;border-radius:${px(radius.pill)};background:${color.ink};color:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.label)};cursor:pointer;box-shadow:${shadow.chip}}
.cx-see[hidden]{display:none}
.cx-see i{font-style:normal}
.cx-tg{flex:0 0 auto;display:inline-flex;gap:2px;padding:3px;border-radius:${px(radius.pill)};background:${color.tile};border:1px solid ${color.lineSoft}}
.cx-tg button{min-height:44px;min-width:64px;padding:0 ${S(4)};border:0;border-radius:${px(radius.pill)};background:transparent;color:${color.ink2};font-family:${font.uiSemiBold};font-size:${px(ty.label)};cursor:pointer;transition:background ${ms(D.base)} ${EASE},color ${ms(D.base)} ${EASE}}
.cx-tg button[aria-pressed="true"]{background:${color.white};color:${color.ink};box-shadow:${shadow.hair}}

/* outcomes: small elegant type, the number inline, the feature behind it */
.cx-outs{grid-column:1/-1;list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(20px,3vw,40px)}
.cx-outs li{padding-top:${S(4)};border-top:1px solid ${color.line}}
.cx-outs .n{display:block;font-family:${font.uiMedium};font-size:${px(ty.micro)};letter-spacing:.2em;color:${color.eyebrow};margin-bottom:${S(2)}}
.cx-outs p{margin:0;font-family:${font.ui};font-size:${px(ty.body)};line-height:1.5;color:${color.ink2};text-wrap:pretty}
.cx-outs b{font-family:${font.serifBold};font-weight:400;font-size:${px(ty.title)};line-height:1.2;letter-spacing:-.01em;color:${color.ink};font-variant-numeric:tabular-nums;white-space:nowrap}
.cx-outs .f{display:flex;align-items:center;gap:${S(2)};margin-top:${S(2)};font-family:${font.uiMedium};font-size:${px(ty.caption)};line-height:1.35;color:${color.eyebrow}}
.cx-outs .f::before{content:"";flex:0 0 auto;width:6px;height:6px;border-radius:${px(radius.pill)};background:${color.lilac500}}
.cx-assume{grid-column:1/-1;margin:-${S(4)} 0 0;font-family:${font.ui};font-size:${px(ty.micro)};line-height:1.5;color:${color.body};max-width:900px}

/* the stack of real screens: offset layers, glass edges, entrance, parallax (desktop) */
.cx-stackfig{margin:0;--px:0;--py:0}
.cx-stack{display:grid;padding-bottom:${S(2)}}
.cx-layer{grid-area:1/1;align-self:start;position:relative;z-index:calc(var(--i) + 1);transform:translate3d(calc(var(--px) * var(--d) * 10px),calc(var(--py) * var(--d) * 8px),0);transition:transform ${ms(D.slow)} ${EASE}}
.cx-in{position:relative;border-radius:${px(radius.md)};background:${color.white};box-shadow:inset 0 0 0 1px ${glass.edge},0 0 0 1px ${color.lineSoft},${shadow.soft};overflow:hidden;opacity:0;transform:translate3d(0,24px,0) scale(.98);transition:opacity ${ms(D.deliberate)} ${EASE},transform ${ms(D.deliberate)} ${EASE},box-shadow ${ms(D.base)} ${EASE};transition-delay:calc(var(--i) * ${ms(D.slow / 2)})}
/* glass rim: a bright edge fading across the card, like the phone story's glass */
.cx-in::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;background:linear-gradient(135deg,${glass.edge},${glass.edgeSoft} 30%,${overlay.white0} 55%,${glass.edgeSoft} 80%,${glass.edge});-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.cx-stackfig.shown .cx-in{opacity:1;transform:none}
.cx-layer:last-child .cx-in{box-shadow:inset 0 0 0 1px ${glass.edge},0 0 0 1px ${color.lineSoft},${shadow.card}}
.cx.d .cx-layer:hover{z-index:10}
.cx.d .cx-layer:hover .cx-in{box-shadow:inset 0 0 0 1px ${glass.edge},0 0 0 1px ${color.lilac300},${shadow.card}}
.cx-in .win{display:block;overflow:hidden}
.cx-in .win img{display:block;max-width:none;height:auto}
.cx-stackfig figcaption{display:flex;flex-direction:column;gap:2px;margin-top:${S(4)}}
.cx-stackfig figcaption b{font-family:${font.uiSemiBold};font-weight:400;font-size:${px(ty.label)};line-height:1.35;color:${color.ink}}
.cx-stackfig figcaption small{font-family:${font.ui};font-size:${px(ty.micro)};line-height:1.4;color:${color.body}}
/* phones: a card opens the zoom viewer */
.cx-zoom{display:block;width:100%;margin:0;padding:0;border:0;background:none;text-align:left;cursor:zoom-in}
.cx-zoom .zi{position:absolute;right:${S(2)};bottom:${S(2)};width:36px;height:36px;border-radius:${px(radius.pill)};background:${glass.chip};-webkit-backdrop-filter:${BLUR_CHIP};backdrop-filter:${BLUR_CHIP};box-shadow:inset 0 0 0 1px ${glass.edge},${shadow.chip}}
.cx-zoom .zi::before{content:"";position:absolute;left:10px;top:10px;width:11px;height:11px;border:2px solid ${color.ink};border-radius:${px(radius.pill)}}
.cx-zoom .zi::after{content:"";position:absolute;left:21px;top:22px;width:6px;height:2px;background:${color.ink};transform:rotate(45deg)}

/* the salon's Zalo OA (illustration) */
.cx-zalo{position:relative;display:flex;flex-direction:column;gap:${S(2)};padding:0 0 ${S(3)};background:${color.zaloChat}}
.cx-zalo .zt{display:flex;align-items:center;gap:${S(2)};padding:${S(2)} ${S(3)};background:${color.zalo};color:${color.white};font-family:${font.uiSemiBold};font-size:${px(ty.label)}}
.cx-zalo .zt i{width:26px;height:26px;border-radius:${px(radius.pill)};background:${color.white};color:${color.zalo};font-style:normal;display:flex;align-items:center;justify-content:center}
.cx-zalo .zt small{padding:1px 6px;border-radius:6px;background:${color.white};color:${color.zalo};font-size:${px(ty.micro)}}
.cx-zalo .zb{max-width:84%;margin:0 ${S(3)};padding:${S(2)} ${S(3)};border-radius:${px(radius.md)};font-family:${font.ui};font-size:${px(ty.label)};line-height:1.4;color:${color.ink};box-shadow:${shadow.hair}}
.cx-zalo .them{align-self:flex-start;background:${color.white}}
.cx-zalo .me{align-self:flex-end;background:${color.zaloSent}}
.cx-zalo .zs{align-self:center;display:flex;align-items:center;gap:${S(1)};margin:0 ${S(3)};padding:${S(1)} ${S(3)};border-radius:${px(radius.pill)};background:${color.white};font-family:${font.uiMedium};font-size:${px(ty.caption)};color:${color.ink2}}
.cx-zalo .zs i{font-style:normal;color:${color.lilac700}}
.cx-zalo .ztag{align-self:flex-end;margin:0 ${S(3)};font-family:${font.uiMedium};font-size:${px(ty.micro)};color:${color.ink2}}

/* phones: one story per screen, swipe between them */
.cx.m{padding:${px(space[10] + space[6])} 0 ${S(8)}}
.cx.m .cx-head{padding:0 ${S(4)}}
.cx.m .fl-h{font-size:clamp(32px,9vw,${px(ty.stat)})}
.cx.m .cx-sub{font-size:${px(ty.body)}}
.cx.m .cx-tabs{margin:${S(6)} 0 ${S(4)};padding:0 ${S(4)};overflow-x:auto;scrollbar-width:none;scroll-padding:0 ${S(4)}}
.cx.m .cx-tabs::-webkit-scrollbar{display:none}
.cx.m .cx-tab{flex:0 0 auto;min-height:44px;padding:0 ${S(4)};border-radius:${px(radius.pill)};font-size:${px(ty.label)}}
.cx.m .cx-tab small{display:none}
.cx.m .cx-panels{display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none;align-items:flex-start;transition:height ${ms(D.slow)} ${EASE}}
.cx.m .cx-panels::-webkit-scrollbar{display:none}
.cx.m .cx-story{flex:0 0 100%;display:flex;flex-direction:column;gap:0;padding:0 ${S(4)};scroll-snap-align:start;scroll-snap-stop:always}
.cx.m .cx-name{font-size:clamp(30px,8.4vw,${px(ty.display)})}
.cx.m .cx-map{margin-top:${S(5)}}
.cx.m .cx-dia{aspect-ratio:320/300}
.cx.m .cx-mh{padding-left:${S(3)}}
.cx.m .cx-mt{font-size:${px(ty.caption)}}
.cx.m .cx-nodes.b li{left:clamp(21%,var(--x),79%);top:clamp(10%,var(--y),90%);font-size:${px(ty.label)};padding:${S(1)} ${S(2)};gap:${S(1)};max-width:40%}
.cx.m .cx-nodes.a li{font-size:${px(ty.label)};top:calc(34% - 22px)}
.cx.m .cx-g{width:16px;height:16px}
.cx.m .cx-nodes.a .d .cx-g{width:18px;height:18px}
.cx.m .cx-fix{padding:${S(2)} ${S(3)}}
.cx.m .cx-see{justify-self:stretch;justify-content:center}
.cx.m .cx-outs{grid-template-columns:1fr;gap:0;margin-top:${S(5)}}
.cx.m .cx-outs li{padding:${S(4)} 0}
.cx.m .cx-outs .n{display:none}
.cx.m .cx-stackfig{margin-top:${S(6)}}
.cx.m .cx-assume{margin:${S(3)} 0 0}
.cx.m .cx-assume-details{margin-top:${S(3)};font-family:${font.ui};color:${color.ink2}}
.cx.m .cx-assume-details summary{min-height:${px(space[10] + space[1])};display:list-item;align-content:center;font-size:${px(ty.label)};cursor:pointer}
.cx.m .cx-assume-details summary:focus-visible{outline:2px solid ${color.lilac500};outline-offset:2px}
.cx-pg{display:flex;align-items:center;justify-content:center;gap:${S(4)};margin-top:${S(6)};padding:0 ${S(4)}}
.cx-pg button{width:48px;height:48px;border-radius:${px(radius.pill)};border:1px solid ${color.lineStrong};background:${color.white};color:${color.ink};font-family:${font.uiSemiBold};font-size:${px(ty.lead)};line-height:1;cursor:pointer}
.cx-pg button:disabled{opacity:.4;cursor:default}
.cx-pg span{min-width:12ch;text-align:center;font-family:${font.uiMedium};font-size:${px(ty.label)};color:${color.ink2};font-variant-numeric:tabular-nums}

@media (prefers-reduced-motion:reduce){
  .cx *,.cx *::before,.cx *::after{animation:none!important;transition:none!important}
  .cx-layer{transform:none}
}
`;
