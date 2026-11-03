import { color, font } from "@gugu/design-system";

/**
 * v4 flow: a photoreal walk through one salon (scroll-scrubbed frame sequences, CSS sticky + GSAP scrub),
 * the front-desk pain → calm transformation over full-bleed photography, a before/after split, features
 * revealed where they happen, the back office, business types and switching. Only transform/opacity
 * animate; frames and photos are never drawn above ~1.15× their native pixels.
 */
export const FLOW_CSS = `
.fl{--g:clamp(16px,4vw,56px);--hud:104px;color:${color.ink}}
@media (max-width:899px){.fl{--hud:84px}}
.fl-sec{position:relative;padding:clamp(72px,10vh,140px) var(--g);max-width:1440px;margin:0 auto}
.fl-eye{font-family:${font.uiMedium};font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:${color.eyebrow}}
.fl-h{font-family:${font.display};font-size:clamp(36px,5vw,76px);line-height:1.02;letter-spacing:-.035em;margin:.25em 0 .3em;white-space:pre-line}
.fl-sub{font-family:${font.ui};font-size:clamp(16px,1.35vw,20px);line-height:1.5;color:${color.ink2};max-width:720px;margin:0}
.fl-note{font-family:${font.ui};font-size:12px;color:${color.muted};margin-top:14px}
.rv{opacity:0;transform:translate3d(0,40px,0) scale(.98);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0ms)}
.rv.in{opacity:1;transform:none}
.card{background:#fff;border:1px solid ${color.lineSoft};border-radius:22px;box-shadow:0 22px 60px rgba(42,20,38,.12)}
.lyr{position:absolute;will-change:transform,opacity}

/* journey: ONE sticky full-screen stage (hero door portal → walk → desk → rooms) */
.jr{position:relative;height:320vh}
.jr-stage{position:sticky;top:0;height:100vh;height:100svh;height:var(--sv,100svh);width:100%;overflow:hidden;contain:layout paint;background:${color.canvas};--fade:0}
/* reduced motion: page turns fade through the canvas colour */
.jr-stage::after{content:"";position:absolute;inset:0;background:${color.canvas};opacity:var(--fade);pointer-events:none;z-index:5}
.jr-hero{position:absolute;left:0;top:0;bottom:0;width:52vw;display:flex;align-items:center;padding:96px var(--g) 40px;box-sizing:border-box;z-index:3;will-change:transform,opacity}
.jr-hero>*{flex:1 1 auto;min-width:0;width:100%}
.jr-frame{position:absolute;inset:0}
.jr-media{position:absolute;inset:0;will-change:transform}
.jr-media canvas,.jr-poster,.jr-calm{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.jr-calm{opacity:0;will-change:opacity;object-position:60% 50%}
.jr-shade{position:absolute;inset:0;background:linear-gradient(0deg,rgba(24,12,22,.62),rgba(24,12,22,.16) 45%,rgba(24,12,22,0) 70%);opacity:0;pointer-events:none;will-change:opacity}
.jr-light{position:absolute;inset:0;background:rgba(253,250,247,.84);opacity:0;pointer-events:none;will-change:opacity}
.jr-veil{position:absolute;inset:0;background:rgba(253,250,247,.86);opacity:0;pointer-events:none;will-change:opacity}
.jr-intro{position:absolute;left:var(--g);bottom:calc(var(--hud) + 6vh);max-width:min(780px,80%);color:#fff;text-shadow:0 2px 24px rgba(0,0,0,.35);opacity:0;transform:translateY(30px);will-change:transform,opacity}
.jr-intro .fl-eye{color:#fff}
.jr-intro .fl-h{font-size:clamp(36px,5.2vw,86px)}
.wk-hint{font-family:${font.uiMedium};font-size:13px;letter-spacing:.2em;text-transform:uppercase;opacity:.9}
.wk-cap{position:absolute;left:var(--g);top:96px;font-family:${font.uiMedium};font-size:12.5px;letter-spacing:.22em;text-transform:uppercase;color:#fff;background:rgba(34,16,36,.45);padding:8px 14px;border-radius:99px;opacity:0;will-change:opacity}
.jr-pain{position:absolute;left:var(--g);top:clamp(96px,13vh,150px);bottom:calc(9vh + 60px);width:min(42vw,640px);display:flex;flex-direction:column;justify-content:space-between}
.jr-stack{display:grid;align-items:start}
.jr-stack>*{grid-area:1/1;opacity:0;will-change:transform,opacity}
.jr-pain .fl-h{font-size:clamp(36px,4.4vw,78px);margin:.2em 0 0}
.pn-stat{display:flex;align-items:flex-end;gap:14px}
.pn-stat .pre{font-family:${font.uiMedium};font-size:14px;color:${color.muted};margin-bottom:.9em}
.pn-stat .big{font-family:${font.display};font-size:clamp(72px,9vw,150px);line-height:.85;letter-spacing:-.05em;color:#C2414B;white-space:nowrap;display:flex;align-items:baseline;gap:.08em}
.pn-stat .big b{font-weight:400;font-variant-numeric:tabular-nums;min-width:1.4ch;text-align:right}
.pn-stat .big small{font-size:.5em;letter-spacing:-.02em}
.pn-badge{align-self:flex-start;display:flex;align-items:center;gap:8px;padding:7px 12px 7px 8px;border-radius:99px;background:#C2414B;color:#fff;font-family:${font.uiSemiBold};font-size:13px;box-shadow:0 12px 30px rgba(194,65,75,.35);opacity:0;will-change:transform,opacity}
.pn-badge b{min-width:26px;height:26px;border-radius:99px;background:#fff;color:#C2414B;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums;font-size:13px;padding:0 6px;box-sizing:border-box}
.pn-stat p{font-family:${font.ui};font-size:clamp(14px,1.2vw,18px);line-height:1.4;color:${color.ink2};max-width:260px;margin:0 0 .4em}
.pn-calm{font-family:${font.ui};font-size:clamp(15px,1.25vw,19px);line-height:1.5;color:${color.ink2};margin:0;max-width:520px}
.pn-g{display:flex;flex-direction:column;gap:10px;margin-top:18px;max-width:400px}
.pn-notes{right:3vw;top:clamp(96px,13vh,150px);width:clamp(250px,22vw,340px);display:flex;flex-direction:column;gap:10px}
.pn-n{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.95);box-shadow:0 18px 40px rgba(20,10,20,.18);font-family:${font.ui};font-size:clamp(12px,.95vw,14px);line-height:1.35;opacity:0;will-change:transform,opacity}
.pn-n i{flex:0 0 28px;height:28px;border-radius:8px;background:#0068FF;color:#fff;font-style:normal;font-family:${font.uiSemiBold};font-size:11px;display:flex;align-items:center;justify-content:center}
.pn-n.call i{background:#C2414B}
.pn-n small{display:block;font-family:${font.uiMedium};font-size:11px;color:${color.muted};margin-bottom:2px}
.pn-book{left:44vw;bottom:calc(11vh + 64px);width:clamp(220px,19vw,300px);padding:16px 18px 18px;background:#FFFBEF;border:1px solid #EADFC2;border-radius:10px;box-shadow:0 22px 50px rgba(20,10,20,.22);opacity:0}
.pn-book .lbl{margin-bottom:6px}
.pn-e{position:relative;font-family:${font.script};font-size:clamp(17px,1.5vw,23px);line-height:1.45;color:#3B2A45;width:max-content}
.pn-e s{position:absolute;left:-4%;right:-4%;top:52%;height:2px;background:#C2414B;transform:scaleX(0);transform-origin:left center;will-change:transform}
.pn-e.hot{color:#C2414B}
.pn-gi{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 18px 40px rgba(20,10,20,.16);font-family:${font.uiMedium};font-size:clamp(12px,1vw,15px);opacity:0;will-change:transform,opacity}
.pn-gi i{flex:0 0 26px;height:26px;border-radius:50%;background:${color.lilac500};color:#fff;font-style:normal;display:flex;align-items:center;justify-content:center;font-size:13px}
.jr-foot{position:absolute;left:var(--g);bottom:calc(2.6vh + 70px);font-family:${font.ui};font-size:11.5px;color:${color.muted};opacity:0}
@media (max-width:899px){
  .jr-hero{width:100%;bottom:auto;height:52vh;align-items:flex-start;padding:100px 16px 12px}
  /* desk scene on phones: pings at the top, headline + number at the bottom above the HUD */
  .jr-pain{left:16px;right:16px;width:auto;top:auto;bottom:46px;justify-content:flex-end;gap:6px}
  .jr-pain .jr-stack:last-child{align-items:end}
  .jr-pain .fl-eye{font-size:11px;letter-spacing:.24em}
  .jr-pain .fl-h{font-size:clamp(28px,8.2vw,36px)}
  .pn-stat{gap:10px}
  .pn-stat .pre{font-size:12px}
  .pn-stat .big{font-size:clamp(50px,15vw,64px)}
  .pn-stat p{font-size:12.5px;max-width:200px}
  .pn-calm{font-size:14px;line-height:1.45}
  .pn-g{margin-top:10px;gap:6px}
  .pn-gi{padding:8px 11px;font-size:12.5px;border-radius:14px}
  .pn-notes{left:14px;right:auto;top:62px;bottom:auto;width:min(74vw,300px);gap:7px}
  .pn-n{padding:8px 10px;font-size:12px;border-radius:14px}
  .pn-n i{flex-basis:24px;height:24px}
  .pn-n:nth-child(n+4){display:none}
  .pn-book{display:none}
  .jr-foot{left:16px;right:16px;bottom:10px;font-size:10px;line-height:1.35}
  .jr-intro{bottom:9%;left:16px;right:16px;max-width:none}
  .jr-intro .fl-h{font-size:clamp(30px,8.6vw,38px)}
  .wk-cap{top:20px;left:16px;font-size:11px}
}

/* front desk: one step, split before | after (left/right; top/bottom on phones) */
.sp{position:absolute;inset:0;opacity:0;will-change:opacity;--x:100%}
.sp-h{position:absolute;inset:0;overflow:hidden}
.sp-l{clip-path:inset(0 calc(100% - var(--x)) 0 0)}
.sp-r{clip-path:inset(0 0 0 var(--x))}
.sp-h>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:58% 40%}
.sp-veil{position:absolute;inset:0;background:rgba(253,250,247,.78);opacity:0;will-change:opacity}
.sp-line{position:absolute;top:0;bottom:0;left:var(--x);width:2px;margin-left:-1px;background:linear-gradient(#A68CF6,#F08DB4);opacity:0}
.sp-knob{position:absolute;top:50%;left:clamp(34px,var(--x),calc(100% - 34px));width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:#fff;color:${color.ink};display:flex;align-items:center;justify-content:center;gap:2px;font-size:13px;box-shadow:0 12px 30px rgba(42,20,38,.25);cursor:ew-resize;pointer-events:auto;touch-action:none;opacity:0;z-index:3;border:0}
.sp-knob::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(169,139,235,.5);animation:hudPulse 2.2s ease-out infinite}
.sp-ui{position:absolute;left:var(--g);right:var(--g);top:clamp(84px,11vh,124px);bottom:calc(var(--hud) + 30px);max-width:1360px;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);column-gap:clamp(24px,4vw,64px);row-gap:clamp(8px,1.6vh,16px);align-content:center}
.sp-ui>*{grid-column:1}
.sp-ui .sp-row,.sp-ui .sp-app{grid-column:2;grid-row:1 / span 8;align-self:center}
.sp-tag,.sp-head,.sp .pn-stat,.pn-calm,.sp-gain{opacity:0;will-change:transform,opacity}
.sp-tag{align-self:flex-start;justify-self:start;font-family:${font.uiSemiBold};font-size:12px;padding:6px 12px;border-radius:99px}
.sp-tag.b{background:#FDE2E4;color:#C2414B}.sp-tag.a{background:${color.ink};color:#fff}
.sp-head .fl-h{font-size:clamp(30px,3.3vw,56px);margin:.15em 0 0}
.sp .pn-stat .big{font-size:clamp(56px,6vw,104px)}
.sp-row{display:flex;gap:16px;align-items:flex-start}
.sp .pn-notes{position:static;width:clamp(220px,19vw,300px);display:flex;flex-direction:column;gap:8px}
.sp .pn-book{position:static;flex:0 0 auto;width:clamp(180px,14vw,240px);transform:rotate(-3deg);margin-top:30px}
.sp .pn-g{margin-top:0}
.sp-gains{display:grid;grid-template-columns:repeat(2,minmax(0,200px));gap:10px}
.sp-gain{background:#fff;border-radius:16px;padding:12px 16px;box-shadow:0 14px 34px rgba(42,20,38,.12)}
.sp-gain b{display:block;font-family:${font.display};font-weight:400;font-size:clamp(26px,2.4vw,40px);line-height:1;letter-spacing:-.03em;background:linear-gradient(90deg,#A68CF6,#F08DB4);-webkit-background-clip:text;background-clip:text;color:transparent}
.sp-gain span{display:block;margin-top:4px;font-family:${font.ui};font-size:13px;line-height:1.3;color:${color.muted}}
.sp-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-width:440px}
.sp-steps li{display:flex;align-items:center;gap:10px;font-family:${font.uiMedium};font-size:clamp(12px,1vw,14px);color:${color.ink2};background:rgba(255,255,255,.7);border-radius:12px;padding:7px 10px;opacity:0;will-change:transform,opacity}
.sp-steps li b{flex:0 0 22px;height:22px;border-radius:50%;background:#FDE2E4;color:#C2414B;display:flex;align-items:center;justify-content:center;font-size:11px}
.sp-app{display:flex;flex-direction:column;gap:12px;max-width:480px;justify-self:end;width:100%}
.sp-cal{position:relative;padding:8px;opacity:0;will-change:transform,opacity}
.sp-cal img{display:block;width:100%;border-radius:12px}
.sp-booked{position:absolute;left:14px;top:-14px;display:flex;align-items:center;gap:8px;background:${color.ink};color:#fff;font-family:${font.uiSemiBold};font-size:12.5px;padding:8px 12px;border-radius:12px;box-shadow:0 12px 28px rgba(34,16,36,.3);opacity:0}
.sp-booked i{font-style:normal;color:${color.lilac300}}
.sp-rem{position:relative;align-self:flex-start;max-width:360px;background:#fff;border-left:4px solid #0068FF;border-radius:16px;padding:10px 14px;font-family:${font.ui};font-size:13px;line-height:1.4;box-shadow:0 14px 34px rgba(42,20,38,.14);opacity:0}
.sp-rem small{display:block;font-family:${font.uiMedium};font-size:11px;color:${color.muted};margin-bottom:2px}
.sp-come{display:inline-block;margin-top:8px;font-family:${font.uiSemiBold};background:${color.lilac500};color:#fff;padding:6px 12px;border-radius:99px;opacity:0}
.sp-app .sv{opacity:0;width:100%}
.sp .pn-g{display:flex;flex-direction:column;gap:7px;max-width:440px}
.sp .jr-foot{left:var(--g);right:var(--g);bottom:calc(var(--hud) + 6px)}
@media (max-width:899px){
  .sp-knob{width:44px;height:44px;margin:-22px 0 0 -22px;top:48%}
  .sp-steps,.sp-rem,.sp-gains,.sp-ui-r .pn-calm{display:none}
  .sp-app{gap:8px;max-width:none}
  .sp-booked{font-size:11px;padding:6px 9px;top:-10px}
  .sp .pn-g{gap:5px}
  .sp-ui{left:16px;right:16px;top:58px;bottom:calc(var(--hud) + 34px);display:flex;flex-direction:column;gap:7px;justify-content:flex-start}
  .sp-gains{grid-template-columns:repeat(3,1fr);gap:6px;max-width:none;margin-top:auto}
  .sp-head .fl-h{font-size:clamp(22px,6.4vw,28px)}
  .sp .pn-stat .big{font-size:44px}
  .sp .pn-book{display:none}
  .sp .pn-notes{width:min(80vw,320px);gap:5px}
  .sp .pn-n:nth-child(n+4){display:none}
  .sp-gains{gap:6px}
  .sp-gain{padding:8px 10px;border-radius:12px}
  .sp-gain b{font-size:20px}.sp-gain span{font-size:10px}
  .sp .pn-gi{padding:7px 10px;font-size:12px}
  .sp .jr-foot{bottom:calc(var(--hud) + 4px);font-size:9.5px}
}
/* treatment area: one headline, then ONE fact + ONE readable CRM screen at a time (scroll steps through
   three). Solid white panels on a strong veil, plum ink numbers, nothing under the HUD. */
.ov-f{grid-template-rows:auto minmax(0,1fr) auto;row-gap:clamp(12px,2.2vh,24px)}
.ov-f .t{grid-column:1/6;grid-row:1}
.ov-f .t .fl-h{font-size:clamp(30px,3.4vw,56px);margin-bottom:0}
.tr-dots{display:flex;gap:6px;margin-top:clamp(10px,2vh,20px);opacity:1}
.tr-dots span{display:block;width:34px;height:4px;border-radius:4px;background:rgba(42,20,38,.12);overflow:hidden}
.tr-dot{display:block;height:100%;background:${color.ink};transform:scaleX(0);transform-origin:left center}
.tr-facts{grid-column:1/6;grid-row:2;display:grid;align-self:center;min-height:0}
.tr-fact{grid-area:1/1;background:#fff;border-radius:24px;padding:clamp(20px,2.4vw,34px);box-shadow:0 24px 60px rgba(42,20,38,.12);opacity:0;will-change:transform,opacity}
.tr-n{font-family:${font.display};font-size:clamp(64px,7vw,120px);line-height:.9;letter-spacing:-.045em;color:${color.ink};transform-origin:left bottom}
.tr-fact h3{font-family:${font.uiSemiBold};font-size:clamp(18px,1.6vw,24px);line-height:1.25;color:${color.ink};margin:clamp(8px,1.2vh,14px) 0 6px}
.tr-g{font-family:${font.ui};font-size:clamp(15px,1.2vw,18px);line-height:1.5;color:${color.ink2};margin:0;max-width:46ch}
.tr-p{display:flex;gap:8px;align-items:flex-start;margin:clamp(12px,1.8vh,18px) 0 0;padding-top:clamp(10px,1.5vh,14px);border-top:1px solid ${color.lineSoft};font-family:${font.ui};font-size:clamp(13px,1vw,14.5px);line-height:1.45;color:${color.muted}}
.tr-p i{font-style:normal;color:#C2414B;flex:0 0 auto}
.tr-p em{font-style:normal;font-family:${font.uiSemiBold};color:#9A3B44;margin-right:6px}
.tr-shots{grid-column:6/13;grid-row:1 / 3;display:grid;align-self:center;min-height:0}
.tr-shot{grid-area:1/1;position:relative;margin:0;padding:14px;opacity:0;will-change:transform,opacity;align-self:center}
.tr-shot figcaption{font-family:${font.uiSemiBold};font-size:14px;color:${color.ink};padding:2px 4px 12px}
/* each screen is cropped to the detail that matters, at a size where its text is readable (≥ ~12 px) */
.tr-img{position:relative;overflow:hidden;border-radius:14px;border:1px solid ${color.lineSoft};aspect-ratio:var(--ar);background:#FDFAF7}
.tr-img img{position:absolute;top:0;left:0;height:100%;width:auto;max-width:none;display:block}
.tr-shot.cal{--ar:1.62}.tr-shot.appt{--ar:2.25}.tr-shot.svc{--ar:1.95}
.tr-shot.cal .tr-img img{height:100%}
.tr-shot.appt .tr-img img{height:100%}
.tr-shot.svc .tr-img img{height:100%}
.tr-call{position:absolute;display:flex;align-items:center;gap:8px;background:${color.ink};color:#fff;font-family:${font.uiSemiBold};font-size:clamp(12.5px,1vw,14px);padding:10px 14px;border-radius:14px;box-shadow:0 16px 40px rgba(34,16,36,.3);opacity:0;will-change:transform,opacity;max-width:70%}
.tr-call i{font-style:normal;color:${color.lilac300}}
.tr-call::before{content:"";position:absolute;width:12px;height:12px;background:inherit;transform:rotate(45deg)}
/* callouts point at their detail: the 10:00 booking, the walk-in row, options + add-ons */
.tr-shot.cal .tr-call{left:46%;top:73%}.tr-shot.cal .tr-call::before{left:22px;top:-5px}
.tr-shot.appt .tr-call{right:22px;top:52%}.tr-shot.appt .tr-call::before{left:-5px;top:calc(50% - 6px)}
.tr-shot.svc .tr-call{left:48%;top:30%}.tr-shot.svc .tr-call::before{left:-5px;top:calc(50% - 6px)}
.tr-note{grid-column:1/13;grid-row:3;margin:0;font-family:${font.ui};font-size:12px;color:${color.muted};opacity:0}
@media (max-width:899px){
  .ov-f{justify-content:flex-start}
  .ov-f .t .fl-h{font-size:clamp(24px,6.6vw,30px)}
  .tr-dots{margin-top:10px}
  .tr-shots{order:2}.tr-facts{order:3}.tr-note{order:4}
  .tr-shots,.tr-facts,.tr-shot,.tr-fact{width:100%;box-sizing:border-box}
  .tr-shot{padding:10px}
  .tr-shot figcaption{font-size:12.5px;padding:0 2px 8px}
  .tr-shot.cal{--ar:1.2}.tr-shot.appt{--ar:1.7}.tr-shot.svc{--ar:1.5}
  .tr-call{font-size:12px;padding:8px 11px;max-width:80%}
  .tr-shot.cal .tr-call{left:30%;top:auto;bottom:-12px}
  .tr-shot.appt .tr-call{left:12px}
  .tr-fact{padding:16px 18px;border-radius:18px}
  .tr-n{font-size:52px}
  .tr-fact h3{font-size:17px;margin:6px 0 4px}
  .tr-g{font-size:14px;line-height:1.45}
  .tr-p{display:none}
  .tr-note{font-size:10.5px}
}
/* switching (in the office): the AI fills the services screen, styled like the CRM */
.ov-s .t{grid-column:1/6;grid-row:1 / 3;align-self:center}
.ov-s .t .fl-h{font-size:clamp(28px,2.9vw,48px)}
.ov-s .t,.sw-steps li,.sw-list,.sw-win,.sw-row{opacity:0;will-change:transform,opacity}
.sw-sub{font-size:clamp(14px,1.1vw,17px)!important;margin-top:6px}
.sw-steps{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.sw-steps li{display:flex;align-items:center;gap:10px;font-family:${font.uiMedium};font-size:clamp(12.5px,1vw,15px);background:#fff;border-radius:14px;padding:9px 12px;box-shadow:0 10px 26px rgba(42,20,38,.08)}
.sw-steps li b{flex:0 0 24px;height:24px;border-radius:50%;background:${color.lilac100};color:${color.lilac700};display:flex;align-items:center;justify-content:center;font-size:12px}
.sw-demo{grid-column:6/13;grid-row:1 / 3;align-self:center;position:relative;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.35fr);gap:clamp(14px,2vw,28px);align-items:center}
.ov-s .sw-list{padding:clamp(20px,2.4vw,40px);transform-origin:center}
.ov-s .sw-list p{font-size:clamp(16px,1.5vw,27px);line-height:1.5;white-space:pre}
.ov-s .sw-list .lbl{font-size:13px}
.sw-list{position:relative;overflow:hidden}
.sw-scan{position:absolute;left:0;right:0;top:0;height:12%;background:linear-gradient(180deg,rgba(169,139,235,0),rgba(169,139,235,.45),rgba(169,139,235,0));opacity:0;pointer-events:none}
.sw-win{padding:0;overflow:hidden}
.sw-bar{display:flex;align-items:center;gap:6px;padding:10px 14px;border-bottom:1px solid ${color.lineSoft};background:#FBF9FB}
.sw-bar span{width:9px;height:9px;border-radius:50%;background:${color.lineSoft}}
.sw-bar b{margin-left:8px;font-family:${font.uiSemiBold};font-size:13px}
.sw-ai{margin:10px 14px;padding:10px 14px;border-radius:14px;background:${color.lilac100}}
.sw-ai-h{display:flex;align-items:center;gap:8px;font-family:${font.uiSemiBold};font-size:13.5px;color:${color.lilac700}}
.sw-ai-h i{font-style:normal}
.sw-prog{height:6px;border-radius:6px;background:rgba(255,255,255,.8);margin:10px 0 8px;overflow:hidden}
.sw-fill{display:block;height:100%;background:linear-gradient(90deg,#A68CF6,#F08DB4);transform:scaleX(0);transform-origin:left center}
.sw-status{position:relative;height:18px;font-family:${font.ui};font-size:12px;color:${color.ink2}}
.sw-status span{position:absolute;left:0;top:0;white-space:nowrap}
.sw-status .s2{opacity:0;font-family:${font.uiSemiBold};color:${color.lilac700}}
.sw-rows{display:grid;grid-template-columns:1fr;gap:5px;margin:0 14px 14px}
.sw-row{position:relative;border:1px solid ${color.lineSoft};border-radius:10px;height:clamp(34px,4.4vh,42px)}
.sw-sk,.sw-val{position:absolute;inset:0;display:flex;align-items:center;gap:8px;padding:0 10px}
.sw-sk span{display:block;height:9px;border-radius:5px;background:linear-gradient(90deg,#EFE8EE,#F7F2F6,#EFE8EE);background-size:200% 100%;animation:swShimmer 1.2s linear infinite}
.sw-sk span:first-child{width:42%}.sw-sk span:last-child{width:22%;margin-left:auto}
.sw-val{opacity:0}
.sw-val div{display:flex;align-items:baseline;gap:10px;min-width:0}
.sw-val b{font-family:${font.uiSemiBold};font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sw-val small{font-family:${font.ui};font-size:11.5px;color:${color.muted}}
.sw-val em{margin-left:auto;font-style:normal;font-family:${font.uiSemiBold};font-size:12.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.sw-tog{flex:0 0 34px;height:20px;border-radius:99px;background:${color.lineSoft};position:relative}
.sw-tog i{position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2)}

@keyframes swShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (max-width:899px){
  .sw-sub{display:none}
  .sw-demo{grid-template-columns:1fr}
  .sw-steps li{padding:7px 10px;font-size:12px}
  .sw-rows{grid-template-columns:1fr}
  .sw-row:nth-child(n+6){display:none}
  .sw-row{height:auto;min-height:40px}
  .sw-sk,.sw-val{position:relative;inset:auto;min-height:44px}
  .sw-sk{position:absolute;inset:0}
  .sw-val small{display:none}
  .sw-val b{font-size:13px}
  .sw-val em{font-size:12.5px}
}
/* switching: old system → GuGu Studio */
.sw-old{position:relative;display:flex;flex-direction:column;align-items:stretch}
.sw-o{position:relative;opacity:0;will-change:transform,opacity}
.sw-o .lbl{font-family:${font.uiSemiBold};font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${color.muted}}
.sw-o.app,.sw-o.xl{background:#fff;border:1px solid ${color.lineSoft};border-radius:16px;box-shadow:0 18px 40px rgba(42,20,38,.12);padding:12px 14px;width:82%}
.sw-o.app{rotate:-4deg;align-self:flex-start}
.sw-o.xl{rotate:3deg;align-self:flex-end;margin-top:-10px}
.sw-app-ui{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.sw-app-ui span{display:block;height:11px;border-radius:6px;background:#EFE8EE}
.sw-app-ui span:nth-child(2n){width:70%}
.sw-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:2px;margin-top:8px}
.sw-grid span{display:block;height:11px;background:#EEF3EC;border:1px solid #DCE6D8}
.sw-grid span:nth-child(-n+5){background:#DCE6D8}
.ov-s .sw-o.nb{z-index:1;width:92%;align-self:center;margin-top:-10px;box-sizing:border-box;padding:16px 20px}
.ov-s .sw-o.nb p{font-size:clamp(15px,1.25vw,20px);line-height:1.45;max-height:7.3em;overflow:hidden;-webkit-mask-image:linear-gradient(#000 70%,transparent);mask-image:linear-gradient(#000 70%,transparent)}
.sw-arrow{position:absolute;left:calc(40% - 22px);top:50%;width:44px;height:44px;margin-top:-22px;border-radius:50%;background:${color.ink};color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;z-index:2;box-shadow:0 12px 30px rgba(34,16,36,.3);opacity:0}
.sw-steps li span{flex:1 1 auto}
.sw-steps .ok{font-style:normal;flex:0 0 22px;height:22px;border-radius:50%;background:${color.ink};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;opacity:0}
@media (max-width:899px){
  .ov-s{justify-content:flex-start}
  .ov-s .t .fl-h{font-size:clamp(22px,6.2vw,27px);margin-bottom:0}
  .ov-s .fl-eye{font-size:11px}
  .sw-demo{display:flex;flex-direction:column;gap:8px}
  .sw-old{flex-direction:row;gap:6px;justify-content:center;flex-wrap:nowrap}
  .ov-s .sw-old .sw-o{transform:none!important;display:block;width:auto;margin:0;translate:none;rotate:none;padding:6px 11px;border-radius:99px;background:#fff;border:1px solid ${color.lineSoft};box-shadow:0 8px 20px rgba(42,20,38,.1);white-space:nowrap}
  .ov-s .sw-old .sw-o .lbl{font-size:10.5px}
  .sw-o .sw-app-ui,.sw-o .sw-grid,.ov-s .sw-o.nb p,.sw-o .sw-scan{display:none}
  .sw-arrow{position:static;margin:0 auto;width:28px;height:28px;font-size:14px;transform:rotate(90deg)}
  .sw-steps{gap:5px;margin-top:10px}
  .ov-s .sw-steps li{padding:6px 10px;font-size:12px;gap:8px}
  .sw-steps li b{flex-basis:20px;height:20px;font-size:10.5px}
  .sw-steps .ok{flex-basis:18px;height:18px;font-size:10px}
  .sw-ai{margin:8px 10px;padding:8px 10px}
  .sw-bar{padding:7px 12px}
  .ov-s .sw-row:nth-child(n+5){display:none}
  .sw-status{height:32px}.sw-status span{white-space:normal;line-height:1.3}
  .sw-rows{margin:0 10px 10px}
}
}
/* back office · Insights (CRM-styled, illustrative figures) */
.ov-i .t{grid-column:1/6;grid-row:1 / 3;align-self:center}
.ov-i .t .fl-h{font-size:clamp(30px,3.2vw,52px)}
.ov-i .t,.in-list li,.in-win,.in-kpi,.in-fun>div{opacity:0;will-change:transform,opacity}
.in-sub{font-size:clamp(14px,1.1vw,17px)!important;margin-top:6px}
.in-list{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.in-list li{display:flex;gap:10px;align-items:center;font-family:${font.uiMedium};font-size:clamp(13px,1vw,15px);color:${color.ink};background:#fff;border-radius:14px;padding:9px 12px;box-shadow:0 10px 26px rgba(42,20,38,.08)}
.in-list li i{font-style:normal;flex:0 0 22px;height:22px;border-radius:50%;background:${color.ink};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px}
.in-win{grid-column:7/13;grid-row:1 / 3;align-self:center;padding:0;overflow:hidden}
.in-eg{margin-left:auto;font-style:normal;font-family:${font.ui};font-size:11.5px;color:${color.muted}}
.in-body{padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.in-kpis{grid-column:1/3;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.in-kpi{border:1px solid ${color.lineSoft};border-radius:14px;padding:12px 14px}
.in-kpi small{display:block;font-family:${font.uiMedium};font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${color.muted}}
.in-kpi b{display:block;margin-top:6px;font-family:${font.uiSemiBold};font-size:clamp(22px,2vw,30px);color:${color.ink};font-variant-numeric:tabular-nums}
.in-block{border:1px solid ${color.lineSoft};border-radius:14px;padding:12px 14px}
.in-zalo{grid-column:1/3}
.in-bh{font-family:${font.uiSemiBold};font-size:12.5px;color:${color.ink};margin-bottom:8px}
.in-bh.sm{margin-top:10px;font-family:${font.uiMedium};color:${color.ink2}}
.in-bar{position:relative;display:flex;align-items:center;gap:8px;height:22px}
.in-bar.sm{flex:1;height:10px;background:${color.tile};border-radius:6px;overflow:hidden}
.in-fill{display:block;height:100%;border-radius:6px;transform-origin:left center;transform:scaleX(0)}
.in-bar:not(.sm) .in-fill{flex:1}
.in-bar.sm .in-fill{width:100%}
.in-fill.a{background:${color.lilac500}}.in-fill.b{background:${color.lilac300}}
.in-bar em{flex:0 0 auto;min-width:5.6em;text-align:right;font-style:normal;font-family:${font.uiSemiBold};font-size:12.5px;color:${color.ink};font-variant-numeric:tabular-nums}
.in-row{display:grid;grid-template-columns:minmax(0,1.1fr) 1.4fr auto;align-items:center;gap:10px;font-family:${font.ui};font-size:12.5px;color:${color.ink2};margin-top:8px}
.in-row b{font-family:${font.uiSemiBold};color:${color.ink};font-variant-numeric:tabular-nums}
.in-fun{display:flex;align-items:center;gap:10px}
.in-fun>div{flex:1;background:${color.lilac100};border-radius:12px;padding:10px 12px}
.in-fun>div:last-child{background:${color.ink};color:#fff}
.in-fun b{display:block;font-family:${font.uiSemiBold};font-size:20px;font-variant-numeric:tabular-nums}
.in-fun small{font-family:${font.ui};font-size:11.5px;opacity:.8}
.in-fun i{flex:0 0 14px;height:2px;background:${color.line}}
@media (max-width:899px){
  .ov-i{justify-content:flex-start}
  .ov-i .t .fl-h{font-size:clamp(24px,6.6vw,30px);margin-bottom:0}
  .in-sub{display:none}
  .in-list{gap:5px;margin-top:10px}
  .in-list li{padding:6px 10px;font-size:12px}
  .in-list li:nth-child(4){display:none}
  .in-body{padding:10px;gap:8px}
  .in-kpi{padding:8px 10px}.in-kpi small{font-size:9.5px}.in-kpi b{font-size:19px}
  .in-mg{display:none}
  .in-rev{grid-column:1/3}
  .in-fun b{font-size:16px}
}
/* X25 band right after the story: Basic free for the first year */
.fy{padding:clamp(72px,12vh,140px) var(--g);background:linear-gradient(180deg,${color.canvas},${color.lilac100})}
.fy-in{max-width:980px;margin:0 auto;text-align:center}
.fy-h{font-size:clamp(38px,5.6vw,84px)}
.fy-glow{background:linear-gradient(90deg,#A68CF6,#F08DB4);-webkit-background-clip:text;background-clip:text;color:transparent}
.fy-sub{margin:0 auto}
.fy-cta{display:flex;gap:14px;justify-content:center;align-items:center;flex-wrap:wrap;margin-top:28px}
.fy-btn{border:0;cursor:pointer;background:${color.ink};color:#fff;font-family:${font.uiSemiBold};font-size:16px;padding:16px 26px;border-radius:99px}
.fy-link{border:0;background:none;cursor:pointer;font-family:${font.uiSemiBold};font-size:15px;color:${color.ink};text-decoration:underline;text-underline-offset:4px}
.fy-btn:focus-visible,.fy-link:focus-visible{outline:2px solid ${color.lilac500};outline-offset:3px}
/* earnings calculator */
.calc{pointer-events:auto;padding:16px 18px}
.calc-t{font-family:${font.uiSemiBold};font-size:15px;margin-bottom:4px}
.calc-r{display:block;margin-top:10px}
.calc-r span{display:flex;justify-content:space-between;gap:10px;font-family:${font.ui};font-size:12.5px;color:${color.muted}}
.calc-r span b{font-family:${font.uiSemiBold};color:${color.ink};font-variant-numeric:tabular-nums}
.calc-r input{width:100%;margin:6px 0 0;accent-color:${color.lilac500};cursor:pointer}
.calc-out{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:12px}
.calc-out b{font-family:${font.display};font-weight:400;font-size:clamp(30px,3vw,46px);line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;background:linear-gradient(90deg,#A68CF6,#F08DB4);-webkit-background-clip:text;background-clip:text;color:transparent}
.calc-out span{font-family:${font.uiMedium};font-size:13px;color:${color.ink2}}
.calc-year{font-family:${font.ui};font-size:12.5px;color:${color.muted};margin-top:4px}
.calc-year b{color:${color.ink};font-family:${font.uiSemiBold}}
.calc-note{font-family:${font.ui};font-size:10.5px;line-height:1.4;color:${color.muted};margin:8px 0 0}.calc-note a{color:inherit}
@media (max-width:899px){
  .ov-f .ft-i p{display:none}
  .ov-f .ft-i{padding:9px 11px}
  .calc{padding:12px 14px}
  .calc-out b{font-size:28px}
}

@media (min-width:900px) and (max-height:940px){.of-side .card:last-child{display:none}}
/* story HUD: chapters + next + skip */
.jr-hud{position:absolute;left:50%;bottom:clamp(14px,3vh,28px);transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:14px;padding:8px 8px 8px 18px;border-radius:99px;background:rgba(255,255,255,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 18px 50px rgba(42,20,38,.16);border:1px solid rgba(255,255,255,.7)}
.jr-hud,.jr-skip{transition:opacity .35s ease,visibility .35s}
.jr-hud.gone,.jr-skip.gone{opacity:0;visibility:hidden;pointer-events:none}
.hud-steps{display:flex;gap:12px}
.hud-s{display:flex;flex-direction:column;gap:6px;background:none;border:0;padding:4px 0;cursor:pointer;min-width:78px;text-align:left}
.hud-bars{display:flex;gap:3px}
.hud-bar{display:block;flex:1;height:3px;border-radius:3px;background:${color.lineSoft};overflow:hidden}
.hud-fill{display:block;height:100%;background:linear-gradient(90deg,#A68CF6,#F08DB4);transform:scaleX(0);transform-origin:left center;will-change:transform}
.hud-s em{font-style:normal;font-family:${font.uiMedium};font-size:11.5px;color:${color.muted};white-space:nowrap;transition:color .3s}
.hud-s.on em{color:${color.ink}}
.hud-next{display:flex;align-items:center;gap:8px;border:0;cursor:pointer;background:${color.ink};color:#fff;font-family:${font.uiSemiBold};font-size:14px;padding:12px 18px;border-radius:99px;position:relative}
.hud-next i{font-style:normal;display:inline-block;animation:hudNudge 1.6s ease-in-out infinite}
.hud-next::after{content:"";position:absolute;inset:-4px;border-radius:99px;border:2px solid rgba(169,139,235,.55);animation:hudPulse 2.2s ease-out infinite;pointer-events:none}
.jr-skip{position:absolute;right:var(--g);bottom:clamp(20px,3.6vh,34px);z-index:6;border:1px solid ${color.line};background:rgba(255,255,255,.8);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:${color.ink};font-family:${font.uiMedium};font-size:13px;padding:9px 14px;border-radius:99px;cursor:pointer}
.jr-skip:hover,.hud-s:hover em{color:${color.lilac700}}
/* Next label: crossfade + width morph the moment a turn starts */
.hud-lbls{position:relative;display:inline-block;height:1.25em;line-height:1.25em;transition:width .35s cubic-bezier(.2,.7,.2,1);white-space:nowrap;vertical-align:middle}
.hud-lbls>span{position:absolute;left:0;top:0;opacity:0;transform:translateY(6px);transition:opacity .25s ease,transform .3s cubic-bezier(.2,.7,.2,1)}
.hud-lbls>span.on{opacity:1;transform:none}
.hud-count{font-family:${font.uiSemiBold};font-size:12.5px;font-variant-numeric:tabular-nums;color:${color.ink2};min-width:3.2em;text-align:right}
.hud-prev{width:42px;height:42px;border-radius:50%;border:1px solid ${color.line};background:#fff;color:${color.ink};font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .25s}
.jr-hud[data-page="0"] .hud-prev{opacity:0;pointer-events:none}
.hud-prev:hover{border-color:${color.lilac500}}
.hud-s:focus-visible,.hud-next:focus-visible,.hud-prev:focus-visible,.jr-skip:focus-visible{outline:2px solid ${color.lilac500};outline-offset:3px}
.hud-hint{position:absolute;left:50%;bottom:calc(100% + 12px);transform:translateX(-50%);white-space:nowrap;font-family:${font.uiMedium};font-size:12.5px;color:${color.ink};background:rgba(255,255,255,.9);padding:7px 12px;border-radius:99px;box-shadow:0 10px 30px rgba(42,20,38,.14);opacity:0;transition:opacity .4s ease;pointer-events:none}
.jr-hud.hinted .hud-hint{opacity:1}
.hud-hint .tc{display:none}
.jr-hud[data-page="0"] .hud-hint .h1,.jr-hud:not([data-page="0"]) .hud-hint .h0{display:none}
@media (pointer:coarse){.hud-hint .k{display:none}.hud-hint .tc{display:inline}}
@keyframes hudNudge{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
@keyframes hudPulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.18)}}
@media (max-width:899px){
  .jr-hud{left:12px;right:12px;transform:none;bottom:12px;padding:6px 6px 6px 12px;gap:10px;justify-content:space-between}
  .hud-steps{gap:6px;flex:1}
  .hud-s{min-width:0;flex:1}
  .hud-s em{display:none}
  .hud-next{padding:10px 14px;font-size:13px}
  .hud-prev{width:36px;height:36px;flex:0 0 36px}
  .hud-count{display:none}
  .jr-skip{top:16px;bottom:auto;right:12px;font-size:12px;padding:7px 12px}
  .jr-pain{bottom:104px}
  .jr-foot{bottom:70px}
}
@media (prefers-reduced-motion:reduce){.hud-next i,.hud-next::after,.sp-knob::after,.ft-chip i{animation:none}.hud-lbls,.hud-lbls>span{transition:opacity .2s}.hud-lbls>span{transform:none}}

/* time-saved card */
.sv{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;padding:14px 20px 14px 14px;width:min(540px,100%);box-sizing:border-box}
.sv-ring{position:relative;width:88px;height:88px}
.sv-ring svg{position:absolute;inset:0;transform:rotate(-90deg)}
.sv-ring circle{fill:none;stroke-width:8}
.sv-ring .bg{stroke:${color.lineSoft}}.sv-ring .fg{stroke:${color.lilac500};stroke-linecap:round}
.sv-ring div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.sv-num{font-family:${font.display};font-size:28px;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:${color.ink}}
.sv-unit{font-family:${font.uiMedium};font-size:11px;color:${color.muted}}
.sv-t{font-family:${font.uiSemiBold};font-size:15px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.sv-t em{font-style:normal;font-family:${font.uiMedium};font-size:11px;color:${color.muted};background:${color.tile};padding:2px 8px;border-radius:99px}
.sv-rows{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.sv-rows div{background:${color.tile};border-radius:12px;padding:8px 10px}
.sv-rows b{display:block;font-family:${font.display};font-size:20px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.sv-rows span{font-family:${font.ui};font-size:11px;color:${color.muted}}
@media (max-width:899px){
  .ba-head{flex-direction:column;align-items:stretch;gap:10px}
  .ba-split{grid-template-columns:1fr;height:56vh;gap:10px}
  .ba-col{padding:12px;grid-template-columns:36% 1fr;gap:10px}
  .ba-steps{padding-top:28px;gap:6px}
  .ba-steps li{padding:6px 8px;font-size:11px}
  .sv{padding:10px 12px;grid-template-columns:64px 1fr;gap:12px}.sv-ring{width:64px;height:64px}.sv-num{font-size:20px}
  .sv-rows b{font-size:16px}
}

/* features + office overlays inside the walk band */
.ov{position:absolute;inset:0;display:grid;grid-template-columns:repeat(12,1fr);grid-template-rows:auto 1fr;gap:clamp(10px,1.4vw,20px);padding:clamp(90px,12vh,130px) var(--g) calc(var(--hud) + 16px);box-sizing:border-box;pointer-events:none;max-width:1500px;margin:0 auto}
.ov .t{grid-column:1/6;opacity:0;will-change:transform,opacity}
.ov .t .fl-h{font-size:clamp(26px,3.2vw,54px)}
.ov .t.r{grid-column:8/13}
.lap{background:#1d1520;border-radius:16px 16px 0 0;padding:10px;box-shadow:0 30px 80px rgba(42,20,38,.28)}
.lap img{display:block;width:100%;border-radius:6px}
.lap-base{height:14px;margin:0 -4%;border-radius:0 0 50% 50%/0 0 100% 100%;background:linear-gradient(#e7e1ea,#bfb6c4)}
.ft-lap{grid-column:6/13;grid-row:1/3;align-self:center;opacity:0;will-change:transform,opacity}
.ft-list{grid-column:1/6;grid-row:2;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-self:end}
.ft-i{padding:14px 16px;opacity:0;will-change:transform,opacity}
.ft-i h3{font-family:${font.uiSemiBold};font-size:clamp(13px,1.1vw,16px);margin:0 0 4px}
.ft-i p{font-family:${font.ui};font-size:clamp(11px,.9vw,13px);line-height:1.45;color:${color.body};margin:0}
.of-lap{grid-column:1/8;grid-row:1/3;align-self:center;opacity:0;will-change:transform,opacity}
.of-side{grid-column:8/13;grid-row:2;display:flex;flex-direction:column;gap:12px;align-self:end}
.of-side .card{padding:16px 18px;opacity:0;will-change:transform,opacity}
.stat{font-family:${font.display};font-size:clamp(40px,4.2vw,72px);line-height:.95;letter-spacing:-.04em;background:linear-gradient(90deg,#A68CF6,#F08DB4);-webkit-background-clip:text;background-clip:text;color:transparent}
.stat-l{font-family:${font.ui};font-size:13.5px;line-height:1.45;color:${color.ink2};margin:6px 0}
.src{font-family:${font.ui};font-size:11.5px;color:${color.muted};pointer-events:auto}.src a{color:${color.lilac700}}
.bub{font-family:${font.ui};font-size:13px;line-height:1.4;padding:.6em .9em;border-radius:16px;background:${color.tile};max-width:92%;margin-top:8px}
.bub.o{margin-left:auto;background:${color.lilac500};color:#fff}
.chip{display:inline-block;font-family:${font.uiSemiBold};font-size:12px;padding:.35em .85em;border-radius:99px;background:${color.ink};color:#fff}
.ft-m{display:none}
@media (max-width:899px){
  .ov{display:flex;flex-direction:column;gap:10px;padding:84px 16px calc(var(--hud) + 14px);justify-content:center}
  .ov .lap{padding:6px;border-radius:10px 10px 0 0}
  .ov .lap-base{height:8px}
  .ov-o .of-lap{order:2}.ov-o .t{order:1}.ov-o .of-side{order:3}
  .ov .t .fl-h{font-size:28px}
  .ft-list{grid-template-columns:1fr 1fr;gap:8px}
  .ft-i{padding:10px 12px}
  .ft-i p{font-size:11.5px}
  .of-side{gap:8px}
  .of-side .card{padding:12px 14px}
  .of-sub{display:none}
  .of-side .card:last-child{display:none}
  .stat-l{font-size:12.5px}
  .stat{font-size:40px}
}

/* businesses */
.bz{padding:clamp(72px,10vh,140px) 0}
.bz-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;max-width:1440px;margin:0 auto;padding:0 var(--g);box-sizing:border-box}
.bz-nav{display:flex;gap:10px;align-items:center;font-family:${font.ui};font-size:13px;color:${color.muted}}
.bz-nav button{width:48px;height:48px;border-radius:50%;border:1px solid ${color.line};background:#fff;color:${color.ink};font-size:20px;cursor:pointer}
.bz-nav button:hover{border-color:${color.lilac500}}
.bz-row{display:flex;gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;padding:28px var(--g) 30px;scrollbar-width:none;cursor:grab}
.bz-row::-webkit-scrollbar{display:none}
.bz-row.drag{cursor:grabbing;scroll-snap-type:none}
.bz-card{position:relative;flex:0 0 min(84vw,560px);aspect-ratio:16/11;border-radius:28px;overflow:hidden;scroll-snap-align:start;background:${color.tile}}
.bz-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;user-select:none;-webkit-user-drag:none;transition:transform 1.2s cubic-bezier(.2,.7,.2,1)}
.bz-card:hover img{transform:scale(1.03)}
.bz-card::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,10,20,0) 40%,rgba(20,10,20,.68))}
.bz-txt{position:absolute;left:24px;right:24px;bottom:22px;z-index:1;color:#fff}
.bz-txt h3{font-family:${font.display};font-size:clamp(24px,2.2vw,34px);letter-spacing:-.02em;margin:0 0 4px}
.bz-txt p{font-family:${font.ui};font-size:15px;line-height:1.45;margin:0;opacity:.92;max-width:420px}
.bz-chip{position:absolute;top:18px;right:18px;z-index:1;font-family:${font.uiMedium};font-size:12.5px;padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.95);color:${color.ink};box-shadow:0 10px 26px rgba(20,10,20,.18)}
.bz-chip i{display:inline-block;width:8px;height:8px;border-radius:50%;background:${color.lilac500};margin-right:8px}
.bz-note{max-width:1440px;margin:0 auto;padding:0 var(--g);box-sizing:border-box;font-family:${font.ui};font-size:12px;color:${color.muted}}
@media (max-width:899px){.bz-head{flex-direction:column;align-items:flex-start}}

/* assistant + switch */
.tc{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,5vw,80px);align-items:center}
@media (max-width:899px){.tc{grid-template-columns:1fr}}
.sw{display:grid;grid-template-columns:1fr auto 1.3fr;gap:clamp(16px,3vw,48px);align-items:center;margin-top:48px}
@media (max-width:899px){.sw{grid-template-columns:1fr}}
.plist{background:#FFFBEF;border:1px solid #EADFC2;border-radius:12px;padding:28px;transform:rotate(-2deg);box-shadow:0 24px 50px rgba(42,20,38,.12)}
.plist p{font-family:${font.script};font-size:clamp(18px,1.7vw,26px);line-height:1.5;color:#3B2A45;white-space:pre-line;margin:8px 0 0}
.arrow{font-size:40px;color:${color.lilac500};text-align:center}
.svc{padding:24px}
.svc-row{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid ${color.lineSoft};border-radius:14px;margin-top:10px;font-family:${font.uiMedium};font-size:16px}
.svc-row span{font-family:${font.ui};color:${color.muted}}
.lbl{font-family:${font.uiMedium};font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:${color.muted}}
@media (prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;transition:none}}
`;
