import { color, font } from "@gugu/design-system";

/**
 * v3 flow (Apple-product-page style): one continuous page, every section owns its space; elements reveal
 * in place (IntersectionObserver → CSS transitions on transform/opacity); the before/after split is the only
 * pinned block (CSS sticky, GSAP scrub). No layout animation, no filters.
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
.fl-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:48px}
@media (max-width:1100px){.fl-grid4{grid-template-columns:repeat(2,1fr)}}
@media (max-width:620px){.fl-grid4{grid-template-columns:1fr}}
.fl-pain{background:#fff;border:1px solid ${color.lineSoft};border-radius:28px;overflow:hidden;display:flex;flex-direction:column}
.fl-pain img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}
.fl-pain div{padding:22px 24px 26px}
.fl-k{font-family:${font.display};font-size:clamp(34px,3vw,48px);letter-spacing:-.03em;line-height:1;color:#C2414B}
.fl-t{font-family:${font.ui};font-size:16px;line-height:1.45;color:${color.ink2};margin:10px 0 12px}
.fl-p{font-family:${font.uiMedium};font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${color.muted}}
/* before / after */
.ba-track{position:relative;height:420vh}
.ba-stage{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 var(--g);max-width:1440px;margin:0 auto;box-sizing:border-box;contain:layout paint}
.ba-head{text-align:center;margin-bottom:clamp(16px,3vh,36px)}
.ba-head .fl-h{font-size:clamp(30px,3.6vw,56px)}
.ba-split{display:grid;grid-template-columns:1fr 1fr;gap:20px;height:min(64vh,620px)}
@media (max-width:899px){.ba-split{grid-template-columns:1fr;height:72vh;gap:12px}}
.ba-col{position:relative;border-radius:28px;overflow:hidden;padding:22px;display:grid;grid-template-columns:minmax(150px,38%) 1fr;gap:18px}
@media (max-width:899px){.ba-col{padding:14px;grid-template-columns:34% 1fr;gap:10px}}
.ba-col.b{background:#FFF4F2;border:1px solid #F3D6D3}.ba-col.a{background:#F4EEFF;border:1px solid #DED2FA}
.ba-tag{position:absolute;top:18px;right:18px;font-family:${font.uiSemiBold};font-size:12px;padding:6px 12px;border-radius:99px}
.b .ba-tag{background:#FDE2E4;color:#C2414B}.a .ba-tag{background:${color.ink};color:#fff}
.ba-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;align-self:center}
.ba-steps li{font-family:${font.uiMedium};font-size:clamp(12px,1vw,15px);line-height:1.3;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.7);color:${color.muted};opacity:.45;transform-origin:left center;will-change:transform,opacity}
.ba-steps li b{display:inline-block;width:20px;color:${color.ink}}
.ba-scene{position:relative;border-radius:20px;background:#fff;overflow:hidden;border:1px solid ${color.lineSoft}}
.ba-scene img.ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.95}
.ba-card{position:absolute;left:6%;right:6%;font-family:${font.ui};font-size:clamp(11px,.95vw,14px);line-height:1.35;padding:.75em 1em;border-radius:16px;background:#fff;border:1px solid ${color.lineSoft};box-shadow:0 14px 34px rgba(42,20,38,.12);opacity:0;will-change:transform,opacity}
.ba-card.zalo{border-left:4px solid #0068FF}
.ba-card.book{font-family:${font.script};font-size:clamp(15px,1.4vw,22px);background:#FFFBEF;border-color:#EADFC2}
.ba-card.ok{background:${color.ink};color:#fff;border:0}
.ba-card.warn{background:#FDE2E4;color:#C2414B;border:0;font-family:${font.uiSemiBold}}
.ba-card.cal{padding:0;overflow:hidden}.ba-card.cal img{display:block;width:100%}
.ba-btn{display:inline-block;margin-top:.5em;font-family:${font.uiSemiBold};background:${color.lilac500};color:#fff;padding:.45em .9em;border-radius:99px}
.ba-saved{position:absolute;left:50%;bottom:clamp(10px,3vh,28px);transform:translateX(-50%);display:flex;align-items:baseline;gap:10px;background:#fff;border:1px solid ${color.lineSoft};border-radius:99px;padding:10px 20px;box-shadow:0 14px 34px rgba(42,20,38,.1);font-family:${font.uiMedium};font-size:14px;color:${color.muted};white-space:nowrap}
.ba-saved b{font-family:${font.display};font-size:28px;color:${color.lilac700};letter-spacing:-.02em;font-variant-numeric:tabular-nums}
@media (max-width:899px){.ba-saved{position:static;transform:none;margin:10px auto 0;width:max-content}.ba-split{height:66vh}}
.ba-note{text-align:center;font-family:${font.ui};font-size:11.5px;color:${color.muted};margin-top:10px}
/* gallery */
.gl{position:relative}
.gl-row{display:flex;gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px var(--g) 28px;scrollbar-width:none;cursor:grab;-webkit-overflow-scrolling:touch}
.gl-row::-webkit-scrollbar{display:none}
.gl-row.drag{cursor:grabbing;scroll-snap-type:none}
.gl-card{flex:0 0 min(78vw,560px);scroll-snap-align:start;background:#fff;border:1px solid ${color.lineSoft};border-radius:28px;overflow:hidden;display:flex;flex-direction:column}
.gl-media{height:min(48vw,340px);background:${color.tile};display:flex;align-items:center;justify-content:center;overflow:hidden}
.gl-media img{max-width:92%;max-height:88%;object-fit:contain;border-radius:12px;box-shadow:0 18px 40px rgba(42,20,38,.14);user-select:none;-webkit-user-drag:none}
.gl-media img.full{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:cover;border-radius:0;box-shadow:none}
.gl-txt{padding:22px 26px 26px}
.gl-txt h3{font-family:${font.uiSemiBold};font-size:20px;margin:0 0 6px}
.gl-txt p{font-family:${font.ui};font-size:15px;line-height:1.5;color:${color.body};margin:0}
.gl-nav{display:flex;gap:10px;justify-content:flex-end;align-items:center;padding:0 var(--g);max-width:1440px;margin:0 auto 14px;font-family:${font.ui};font-size:13px;color:${color.muted}}
.gl-nav button{width:48px;height:48px;border-radius:50%;border:1px solid ${color.line};background:#fff;color:${color.ink};font-size:20px;cursor:pointer}
.gl-nav button:hover{border-color:${color.lilac500}}
/* composition */
.cp{display:grid;grid-template-columns:repeat(12,1fr);gap:20px;align-items:start;margin-top:48px}
.cp-lap{grid-column:1/9}
.cp-side{grid-column:9/13;display:flex;flex-direction:column;gap:20px}
@media (max-width:1000px){.cp-lap,.cp-side{grid-column:1/-1}}
.lap{background:#1d1520;border-radius:18px 18px 0 0;padding:12px;box-shadow:0 30px 80px rgba(42,20,38,.18)}
.lap img{display:block;width:100%;border-radius:6px}
.lap-base{height:16px;margin:0 -4%;border-radius:0 0 50% 50%/0 0 100% 100%;background:linear-gradient(#e7e1ea,#bfb6c4)}
.cp-card{background:#fff;border:1px solid ${color.lineSoft};border-radius:24px;padding:22px;box-shadow:0 18px 40px rgba(42,20,38,.06)}
.cp-card img{display:block;width:100%;border-radius:12px}
.stat{font-family:${font.display};font-size:clamp(56px,6vw,96px);line-height:.95;letter-spacing:-.04em;background:linear-gradient(90deg,#A68CF6,#F08DB4);-webkit-background-clip:text;background-clip:text;color:transparent}
.stat-l{font-family:${font.ui};font-size:16px;line-height:1.45;color:${color.ink2};margin:10px 0}
.src{font-family:${font.ui};font-size:12px;color:${color.muted}}.src a{color:${color.lilac700}}
.ph-mini{background:#1d1520;border-radius:34px;padding:10px;max-width:300px;margin:0 auto}
.ph-mini>div{background:#F6F1F8;border-radius:26px;padding:42px 14px 18px;display:flex;flex-direction:column;gap:10px;min-height:250px}
.bub{font-family:${font.ui};font-size:14px;line-height:1.4;padding:.7em .95em;border-radius:18px;background:#fff;border:1px solid ${color.lineSoft};max-width:88%}
.bub.o{align-self:flex-end;background:${color.lilac500};color:#fff;border:0}
/* two-col */
.tc{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,5vw,80px);align-items:center}
@media (max-width:899px){.tc{grid-template-columns:1fr}}
.chat{background:#fff;border:1px solid ${color.lineSoft};border-radius:28px;padding:26px;display:flex;flex-direction:column;gap:12px;box-shadow:0 24px 60px rgba(42,20,38,.08)}
.chip{align-self:flex-start;font-family:${font.uiSemiBold};font-size:13px;padding:.4em .9em;border-radius:99px;background:${color.ink};color:#fff}
/* switch */
.sw{display:grid;grid-template-columns:1fr auto 1.3fr;gap:clamp(16px,3vw,48px);align-items:center;margin-top:48px}
@media (max-width:899px){.sw{grid-template-columns:1fr}}
.plist{background:#FFFBEF;border:1px solid #EADFC2;border-radius:12px;padding:28px;transform:rotate(-2deg);box-shadow:0 24px 50px rgba(42,20,38,.12)}
.plist p{font-family:${font.script};font-size:clamp(18px,1.7vw,26px);line-height:1.5;color:#3B2A45;white-space:pre-line;margin:8px 0 0}
.arrow{font-size:40px;color:${color.lilac500};text-align:center}
.svc{background:#fff;border:1px solid ${color.lineSoft};border-radius:24px;padding:24px;box-shadow:0 24px 60px rgba(42,20,38,.1)}
.svc-row{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid ${color.lineSoft};border-radius:14px;margin-top:10px;font-family:${font.uiMedium};font-size:16px}
.svc-row span{font-family:${font.ui};color:${color.muted}}
.lbl{font-family:${font.uiMedium};font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:${color.muted}}
@media (prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;transition:none}}
`;
