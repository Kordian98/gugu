import { color, font } from "@gugu/design-system";

/**
 * Story stage styles. Pinning is pure CSS (`position: sticky` inside the page scroller, composited by
 * the browser), so the stage never moves while pinned. GSAP only scrubs transform/opacity of children.
 */
export const STORY_CSS = `
.st-track{position:relative;height:1100vh}
.st-stage{position:sticky;top:0;height:100vh;overflow:hidden;background:${color.canvas};perspective:1400px;contain:layout paint}
.st-abs{position:absolute}
.st-fade{position:absolute;left:0;right:0;top:0;height:34vh;background:linear-gradient(${color.canvas} 30%,rgba(253,250,247,0));pointer-events:none;z-index:5}
.st-dio{position:absolute;left:50%;top:50%;width:max(104vw,147vh);aspect-ratio:1388/980;transform-origin:50% 50%;will-change:transform}
.st-dio img,.st-dio video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.st-prop{position:absolute;will-change:transform}
.st-veil{position:absolute;inset:0;background:${color.canvas};opacity:0;pointer-events:none}
.st-door{position:absolute;top:0;bottom:0;width:50.5%;background:linear-gradient(180deg,#E9DCFB 0%,#F6D3E2 100%);box-shadow:inset 0 0 0 1px rgba(42,20,38,.06);will-change:transform;backface-visibility:hidden}
.st-door.l{left:0;transform-origin:0% 50%}.st-door.r{right:0;transform-origin:100% 50%}
.st-door i{position:absolute;top:12%;bottom:12%;left:16%;right:16%;border-radius:999px 999px 18px 18px;border:2px solid rgba(255,255,255,.75);background:rgba(255,255,255,.18)}
.st-door b{position:absolute;top:52%;width:12px;height:64px;border-radius:8px;background:${color.gold400}}
.st-door.l b{right:9%}.st-door.r b{left:9%}
.st-heads{position:absolute;left:0;right:0;top:5vh;display:flex;justify-content:center;pointer-events:none;z-index:6}
.st-head{position:absolute;max-width:min(92vw,980px);text-align:center;opacity:0;will-change:transform,opacity}
.st-eye{font-family:${font.uiMedium};font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:${color.eyebrow}}
.st-title{font-family:${font.display};font-size:clamp(30px,min(4.4vw,7.4vh),70px);line-height:1.02;letter-spacing:-.035em;color:${color.ink};white-space:pre-line;margin:.25em 0 .3em}
.st-sub{font-family:${font.ui};font-size:clamp(14px,min(1.2vw,2.1vh),19px);line-height:1.5;color:${color.ink2};max-width:640px;margin:0 auto}
.st-note{font-family:${font.ui};font-size:11.5px;color:${color.muted};margin-top:8px}
.st-mid{position:absolute;left:50%;top:64%;width:min(56vw,86vh,980px);aspect-ratio:16/10;transform:translate(-50%,-50%)}
@media (max-width:899px){.st-mid{top:66%;width:88vw}.st-heads{top:10vh}}
.st-laptop{position:absolute;inset:0;opacity:0;will-change:transform,opacity}
.st-screen{position:absolute;inset:0;border-radius:2% 2% 0 0/3.2% 3.2% 0 0;background:#1d1520;padding:1.6%;box-shadow:0 30px 80px rgba(42,20,38,.22)}
.st-glass{position:relative;width:100%;height:100%;border-radius:.6%;overflow:hidden;background:#fff}
.st-glass img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top left}
.st-base{position:absolute;left:-7%;right:-7%;bottom:-4.2%;height:4.2%;border-radius:0 0 40% 40%/0 0 100% 100%;background:linear-gradient(#e7e1ea,#bfb6c4)}
.st-slot{position:absolute;border-radius:6px;background:${color.lilac500};opacity:0;box-shadow:0 0 0 3px rgba(169,139,235,.35)}
.st-phone{position:absolute;right:-4%;bottom:-14%;width:min(21vw,34vh,250px);aspect-ratio:.49;border-radius:15%/7.5%;background:#1d1520;padding:3.2%;opacity:0;will-change:transform,opacity;box-shadow:0 30px 70px rgba(42,20,38,.28);z-index:4}
@media (max-width:899px){.st-phone{width:38vw;right:-2%;bottom:-38%}}
.st-pscreen{position:relative;width:100%;height:100%;border-radius:12%/6%;background:#F6F1F8;overflow:hidden}
.st-pscreen .st-notch{position:absolute;top:2.2%;left:35%;right:35%;height:3.4%;border-radius:99px;background:#1d1520}
.st-pane{position:absolute;inset:11% 6% 4%;display:flex;flex-direction:column;gap:6%;opacity:0}
.st-b{font-family:${font.ui};font-size:clamp(9px,.82vw,13px);line-height:1.38;padding:.6em .85em;border-radius:1.2em;max-width:88%;background:#fff;color:${color.ink};border:1px solid ${color.lineSoft};will-change:transform,opacity}
.st-b.o{align-self:flex-end;background:${color.lilac500};color:#fff;border:0}
.st-b.ai{background:#fff}
.st-chip{font-family:${font.uiSemiBold};font-size:clamp(9px,.8vw,12px);padding:.35em .8em;border-radius:99px;align-self:flex-start}
.st-bub{position:absolute;font-family:${font.ui};font-size:clamp(11px,1vw,15px);line-height:1.35;padding:.7em 1em;border-radius:1.2em 1.2em 1.2em .3em;background:#fff;color:${color.ink};border:1px solid ${color.lineSoft};box-shadow:0 12px 30px rgba(42,20,38,.10);opacity:0;will-change:transform,opacity;max-width:min(30vw,280px)}
@media (max-width:899px){.st-bub{max-width:52vw}}
.st-bub small{display:block;font-size:.75em;color:${color.muted};margin-top:.25em}
.st-badge{position:absolute;font-family:${font.uiSemiBold};font-size:13px;color:#fff;background:#E5484D;padding:.35em .8em;border-radius:99px;opacity:0}
.st-book{position:absolute;left:18%;right:18%;top:6%;bottom:6%;background:#FFFBEF;border:1px solid #EADFC2;border-radius:10px;box-shadow:0 30px 60px rgba(42,20,38,.16);padding:4% 6%;opacity:0;will-change:transform,opacity;display:flex;flex-direction:column;gap:3%}
.st-book p{margin:0;font-family:${font.script};font-size:clamp(16px,2.1vw,30px);color:#3B2A45;border-bottom:1px solid #E9DDBE;padding-bottom:.2em}
.st-book p.x{color:#B23A48;text-decoration:line-through}
.st-stamp{position:absolute;font-family:${font.uiSemiBold};font-size:clamp(12px,1.1vw,16px);color:#C2414B;border:2px solid #C2414B;border-radius:8px;padding:.25em .6em;background:rgba(255,255,255,.85);opacity:0;will-change:transform,opacity}
.st-card{position:absolute;border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(42,20,38,.18);opacity:0;will-change:transform,opacity;background:#fff}
.st-card img{display:block;width:100%;height:auto}
.st-sw{position:absolute;inset:0;opacity:0}
.st-plist{position:absolute;left:2%;top:10%;width:34%;background:#FFFBEF;border:1px solid #EADFC2;border-radius:10px;padding:3%;box-shadow:0 20px 50px rgba(42,20,38,.14);opacity:0;will-change:transform,opacity}
.st-plist p{margin:0;font-family:${font.script};font-size:clamp(13px,1.4vw,21px);line-height:1.4;color:#3B2A45;white-space:pre-line}
.st-lbl{font-family:${font.uiMedium};font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:${color.muted};margin-bottom:.6em}
.st-cat{position:absolute;right:2%;top:6%;width:52%;background:#fff;border:1px solid ${color.lineSoft};border-radius:16px;padding:3%;box-shadow:0 24px 60px rgba(42,20,38,.16);opacity:0}
.st-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:.7em .9em;border-radius:12px;border:1px solid ${color.lineSoft};margin-top:.6em;opacity:0;will-change:transform,opacity;font-family:${font.uiMedium};font-size:clamp(11px,1vw,15px);color:${color.ink}}
.st-row span{color:${color.muted};font-family:${font.ui}}
.st-eff{position:absolute;left:0;right:0;bottom:-10%;text-align:center;font-family:${font.uiSemiBold};font-size:clamp(13px,1.2vw,18px);color:${color.lilac700};opacity:0}
`;
