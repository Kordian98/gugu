import { color, font } from "@gugu/design-system";

/**
 * v4 flow: a photoreal walk through one salon (scroll-scrubbed frame sequences, CSS sticky + GSAP scrub),
 * the front-desk pain → calm transformation over full-bleed photography, a before/after split, features
 * revealed where they happen, the back office, business types and switching. Only transform/opacity
 * animate; frames and photos are never drawn above ~1.15× their native pixels.
 */
export const FLOW_CSS = `
.fl{--g:clamp(16px,4vw,56px);color:${color.ink}}
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
.jr{position:relative;height:700vh}
.jr-stage{position:sticky;top:0;height:100vh;width:100%;overflow:hidden;contain:layout paint;background:${color.canvas}}
.jr-hero{position:absolute;left:0;top:0;bottom:0;width:52vw;display:flex;align-items:center;padding:96px var(--g) 40px;box-sizing:border-box;z-index:3;will-change:transform,opacity}
.jr-hero>*{flex:1 1 auto;min-width:0;width:100%}
.jr-frame{position:absolute;inset:0}
.jr-media{position:absolute;inset:0;will-change:transform}
.jr-media canvas,.jr-poster,.jr-v{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.jr-v{opacity:0;will-change:opacity}
.jr-shade{position:absolute;inset:0;background:linear-gradient(0deg,rgba(24,12,22,.62),rgba(24,12,22,.16) 45%,rgba(24,12,22,0) 70%);opacity:0;pointer-events:none;will-change:opacity}
.jr-light{position:absolute;inset:0;background:linear-gradient(90deg,rgba(253,250,247,.96),rgba(253,250,247,.82) 30%,rgba(253,250,247,.25) 48%,rgba(253,250,247,0) 58%);opacity:0;pointer-events:none;will-change:opacity}
.jr-veil{position:absolute;inset:0;background:rgba(253,250,247,.86);opacity:0;pointer-events:none;will-change:opacity}
.jr-intro{position:absolute;left:var(--g);bottom:11%;max-width:min(780px,80%);color:#fff;text-shadow:0 2px 24px rgba(0,0,0,.35);opacity:0;transform:translateY(30px);will-change:transform,opacity}
.jr-intro .fl-eye{color:#fff}
.jr-intro .fl-h{font-size:clamp(36px,5.2vw,86px)}
.wk-hint{font-family:${font.uiMedium};font-size:13px;letter-spacing:.2em;text-transform:uppercase;opacity:.9}
.wk-cap{position:absolute;left:var(--g);top:96px;font-family:${font.uiMedium};font-size:12.5px;letter-spacing:.22em;text-transform:uppercase;color:#fff;background:rgba(34,16,36,.45);padding:8px 14px;border-radius:99px;opacity:0;will-change:opacity}
.jr-pain{position:absolute;left:var(--g);top:clamp(96px,13vh,150px);bottom:9vh;width:min(42vw,640px);display:flex;flex-direction:column;justify-content:space-between}
.jr-stack{display:grid}
.jr-stack>*{grid-area:1/1;opacity:0;will-change:transform,opacity}
.jr-pain .fl-h{font-size:clamp(36px,4.4vw,78px);margin:.2em 0 0}
.pn-stat{display:flex;align-items:flex-end;gap:14px}
.pn-stat .pre{font-family:${font.uiMedium};font-size:14px;color:${color.muted};margin-bottom:.9em}
.pn-stat .big{font-family:${font.display};font-size:clamp(72px,9vw,150px);line-height:.85;letter-spacing:-.05em;color:#C2414B;white-space:nowrap}
.pn-stat p{font-family:${font.ui};font-size:clamp(14px,1.2vw,18px);line-height:1.4;color:${color.ink2};max-width:260px;margin:0 0 .4em}
.pn-calm{font-family:${font.ui};font-size:clamp(15px,1.25vw,19px);line-height:1.5;color:${color.ink2};margin:0;max-width:520px}
.pn-g{display:flex;flex-direction:column;gap:10px;margin-top:18px;max-width:400px}
.pn-notes{right:3vw;top:clamp(96px,13vh,150px);width:clamp(250px,22vw,340px);display:flex;flex-direction:column;gap:10px}
.pn-n{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.95);box-shadow:0 18px 40px rgba(20,10,20,.18);font-family:${font.ui};font-size:clamp(12px,.95vw,14px);line-height:1.35;opacity:0;will-change:transform,opacity}
.pn-n i{flex:0 0 28px;height:28px;border-radius:8px;background:#0068FF;color:#fff;font-style:normal;font-family:${font.uiSemiBold};font-size:11px;display:flex;align-items:center;justify-content:center}
.pn-n.call i{background:#C2414B}
.pn-n small{display:block;font-family:${font.uiMedium};font-size:11px;color:${color.muted};margin-bottom:2px}
.pn-book{left:44vw;bottom:8vh;width:clamp(220px,19vw,300px);padding:16px 18px 18px;background:#FFFBEF;border:1px solid #EADFC2;border-radius:10px;box-shadow:0 22px 50px rgba(20,10,20,.22);opacity:0}
.pn-book .lbl{margin-bottom:6px}
.pn-e{position:relative;font-family:${font.script};font-size:clamp(17px,1.5vw,23px);line-height:1.45;color:#3B2A45;width:max-content}
.pn-e s{position:absolute;left:-4%;right:-4%;top:52%;height:2px;background:#C2414B;transform:scaleX(0);transform-origin:left center;will-change:transform}
.pn-e.hot{color:#C2414B}
.pn-gi{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 18px 40px rgba(20,10,20,.16);font-family:${font.uiMedium};font-size:clamp(12px,1vw,15px);opacity:0;will-change:transform,opacity}
.pn-gi i{flex:0 0 26px;height:26px;border-radius:50%;background:${color.lilac500};color:#fff;font-style:normal;display:flex;align-items:center;justify-content:center;font-size:13px}
.jr-foot{position:absolute;left:var(--g);bottom:2.6vh;font-family:${font.ui};font-size:11.5px;color:${color.muted};opacity:0}
@media (max-width:899px){
  .jr{height:650vh}
  .jr-hero{width:100%;bottom:auto;height:58vh;align-items:flex-end;padding:84px 16px 14px}
  .jr-light{background:linear-gradient(180deg,rgba(253,250,247,.97),rgba(253,250,247,.88) 36%,rgba(253,250,247,0) 58%)}
  .jr-pain{left:16px;right:16px;width:auto;top:74px;bottom:auto;justify-content:flex-start;gap:8px}
  .jr-pain .fl-h{font-size:31px}
  .pn-stat .big{font-size:58px}
  .pn-stat p{font-size:13px;max-width:190px}
  .pn-calm{font-size:14px}
  .pn-g{margin-top:10px;gap:6px}
  .pn-gi{padding:8px 10px;font-size:12px}
  .pn-notes{left:16px;right:auto;top:auto;bottom:20vh;width:68vw}
  .pn-n{padding:9px 11px;font-size:12px}
  .pn-n:nth-child(n+4){display:none}
  .pn-book{left:auto;right:16px;bottom:4vh;width:48vw;padding:12px 14px}
  .pn-e{font-size:16px}
  .jr-intro{bottom:9%}
  .jr-intro .fl-h{font-size:34px}
  .wk-cap{top:76px;left:16px}
}

/* before / after */
.ba-track{position:relative;height:420vh}
.ba-stage{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 var(--g);max-width:1440px;margin:0 auto;box-sizing:border-box;contain:layout paint}
.ba-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:clamp(14px,2.6vh,30px)}
.ba-head .fl-h{font-size:clamp(28px,3.4vw,54px);margin:.2em 0 0}
.ba-split{display:grid;grid-template-columns:1fr 1fr;gap:20px;height:min(60vh,600px)}
.ba-col{position:relative;border-radius:28px;overflow:hidden;padding:20px;display:grid;grid-template-columns:minmax(150px,36%) 1fr;gap:16px}
.ba-col.b{background:#FFF4F2;border:1px solid #F3D6D3}.ba-col.a{background:#F4EEFF;border:1px solid #DED2FA}
.ba-tag{position:absolute;top:16px;left:20px;font-family:${font.uiSemiBold};font-size:12px;padding:6px 12px;border-radius:99px;z-index:2}
.b .ba-tag{background:#FDE2E4;color:#C2414B}.a .ba-tag{background:${color.ink};color:#fff}
.ba-steps{list-style:none;margin:0;padding:34px 0 0;display:flex;flex-direction:column;gap:10px;align-self:center}
.ba-steps li{font-family:${font.uiMedium};font-size:clamp(12px,1vw,15px);line-height:1.3;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.75);color:${color.muted};opacity:.45;transform-origin:left center;will-change:transform,opacity}
.ba-steps li b{display:inline-block;width:20px;color:${color.ink}}
.ba-scene{position:relative;border-radius:20px;background:#fff;overflow:hidden}
.ba-scene img.ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ba-scene.b img.ph{object-position:66% 40%}.ba-scene.a img.ph{object-position:45% 40%}
.ba-card{position:absolute;left:6%;right:6%;font-family:${font.ui};font-size:clamp(11px,.95vw,14px);line-height:1.35;padding:.75em 1em;border-radius:16px;background:#fff;border:1px solid ${color.lineSoft};box-shadow:0 14px 34px rgba(42,20,38,.16);opacity:0;will-change:transform,opacity}
.ba-card.zalo{border-left:4px solid #0068FF}
.ba-card.book{font-family:${font.script};font-size:clamp(15px,1.4vw,22px);background:#FFFBEF;border-color:#EADFC2}
.ba-card.ok{background:${color.ink};color:#fff;border:0}
.ba-card.warn{background:#FDE2E4;color:#C2414B;border:0;font-family:${font.uiSemiBold}}
.ba-card.cal{padding:0;overflow:hidden}.ba-card.cal img{display:block;width:100%}
.ba-btn{display:inline-block;margin-top:.5em;font-family:${font.uiSemiBold};background:${color.lilac500};color:#fff;padding:.45em .9em;border-radius:99px}
.ba-note{font-family:${font.ui};font-size:11.5px;color:${color.muted};margin-top:10px}
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
.ov{position:absolute;inset:0;display:grid;grid-template-columns:repeat(12,1fr);grid-template-rows:auto 1fr;gap:clamp(10px,1.4vw,20px);padding:clamp(90px,12vh,130px) var(--g) clamp(28px,6vh,64px);box-sizing:border-box;pointer-events:none;max-width:1500px;margin:0 auto}
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
  .ov{display:flex;flex-direction:column;gap:10px;padding:72px 16px 16px;justify-content:flex-start}
  .ov .t .fl-h{font-size:28px}
  .ft-list{grid-template-columns:1fr 1fr;gap:8px}
  .ft-i{padding:10px 12px}
  .ft-i p{font-size:11.5px}
  .of-side{gap:8px}
  .of-side .card{padding:12px 14px}
  .of-sub{display:none}
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
