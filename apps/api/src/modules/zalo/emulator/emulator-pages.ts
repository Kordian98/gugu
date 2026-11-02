/**
 * HTML of the Zalo emulator (dev tool, English only — never shown to salons or customers).
 * Plain HTML + fetch, no external assets.
 */
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

const STYLE = `body{font:15px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#eef1f5;color:#1f2937}
main{max-width:980px;margin:0 auto;padding:16px}h1{font-size:18px;margin:8px 0 16px}
.card{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 2px #0001;margin-bottom:12px}
label{display:block;font-size:12px;color:#6b7280;margin:8px 0 4px}input,select{width:100%;box-sizing:border-box;padding:8px;border:1px solid #d1d5db;border-radius:8px;font:inherit}
button{padding:8px 12px;border-radius:8px;border:0;background:#0068ff;color:#fff;font:inherit;cursor:pointer;margin:4px 4px 0 0}
button.alt{background:#e5e7eb;color:#111827}.row{display:flex;gap:12px;flex-wrap:wrap}.row>*{flex:1;min-width:160px}
#chat{height:420px;overflow:auto;background:#f9fafb;border-radius:8px;padding:12px}.msg{max-width:75%;margin:6px 0;padding:8px 12px;border-radius:14px;white-space:pre-wrap}
.me{margin-left:auto;background:#0068ff;color:#fff}.oa{background:#fff;border:1px solid #e5e7eb}.tpl{background:#fff7e6;border:1px solid #f5d08a}
.btns button{background:#eef4ff;color:#0047b3;border:1px solid #c7dbff}.meta{font-size:11px;color:#6b7280}`;

export function consentPage(q: {
  redirect_uri: string;
  code_challenge: string;
  state: string;
}): string {
  const oa = `oa_${Math.random().toString(36).slice(2, 8)}`;
  const hidden = (name: string, value: string) =>
    `<input type="hidden" name="${name}" value="${esc(value)}">`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zalo emulator · Grant access</title><style>${STYLE}</style></head>
<body><main><h1>Zalo emulator — grant OA access</h1><div class="card">
<p>A salon is connecting its Zalo Official Account to GuGu Studio. In real Zalo the OA admin signs in and approves here.</p>
<form method="get" action="approve">${hidden("redirect_uri", q.redirect_uri)}${hidden("code_challenge", q.code_challenge)}${hidden("state", q.state)}
<div class="row"><div><label>OA id</label><input name="oa_id" value="${oa}" required></div>
<div><label>OA name</label><input name="oa_name" value="Lotus Nails OA" required></div></div>
<button name="decision" value="allow">Allow</button><button class="alt" name="decision" value="deny">Deny</button></form></div></main></body></html>`;
}

export function simulatorPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zalo emulator</title><style>${STYLE}</style></head>
<body><main><h1>Zalo emulator — chat as a customer</h1>
<div class="card"><div class="row">
<div><label>Salon OA (connect one in GuGu Studio → Settings → Zalo)</label><select id="oa"></select></div>
<div><label>Customer Zalo user id</label><input id="uid"></div>
<div><label>Customer name</label><input id="name" value="Mai"></div>
<div><label>Phone (for "share info")</label><input id="phone" value="0901234567"></div></div>
<button class="alt" onclick="send('follow')">Follow OA</button><button class="alt" onclick="send('user_submit_info')">Share phone</button>
<button class="alt" onclick="send('user_send_sticker')">Send sticker</button><button class="alt" onclick="send('unfollow')">Unfollow</button>
<button class="alt" onclick="faults({failNext:2})">Next 2 sends fail (503)</button><button class="alt" onclick="faults({expireTokens:true})">Expire tokens</button><button class="alt" onclick="faults({})">Clear faults</button></div>
<div class="card"><div id="chat"></div><div class="row" style="margin-top:8px"><input id="text" placeholder="Type a message… (e.g. xin chào)" onkeydown="if(event.key==='Enter')sendText()"><button style="flex:0" onclick="sendText()">Send</button></div><div class="meta" id="status"></div></div>
</main><script>
const api = location.pathname.replace(/\\/$/, '');
const $ = (id) => document.getElementById(id);
const mine = [];
$('uid').value = localStorage.getItem('zemu.uid') || ('u' + Math.random().toString(36).slice(2, 10));
$('uid').onchange = () => localStorage.setItem('zemu.uid', $('uid').value);
localStorage.setItem('zemu.uid', $('uid').value);
async function loadOas(){const oas=await (await fetch(api+'/oas',{credentials:'omit'})).json();$('oa').innerHTML=oas.map(o=>'<option value="'+o.oaId+'">'+o.name+' ('+o.oaId+')</option>').join('')||'<option value="">— connect an OA first —</option>';
 const want=new URLSearchParams(location.search).get('oa')||localStorage.getItem('zemu.oa');if(want&&oas.some(o=>o.oaId===want))$('oa').value=want;localStorage.setItem('zemu.oa',$('oa').value);$('oa').onchange=()=>{localStorage.setItem('zemu.oa',$('oa').value);poll();};}
async function send(event, text){const body={oaId:$('oa').value,userId:$('uid').value,event,name:$('name').value,phone:$('phone').value};if(text!==undefined)body.text=text;
 const r=await fetch(api+'/events',{method:'POST',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();$('status').textContent='webhook → '+j.status;
 mine.push({at:new Date().toISOString(),me:true,text: event==='user_send_text'?(text.startsWith('gg|')?'▸ '+(window.lastTitles?.[text]||'button'):text):'['+event+']'});render();setTimeout(poll,600);setTimeout(poll,1600);}
function sendText(){const t=$('text').value.trim();if(!t)return;$('text').value='';send('user_send_text',t);}
async function faults(f){await fetch(api+'/faults/'+$('oa').value,{method:'PUT',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify(f)});$('status').textContent='faults: '+JSON.stringify(f);}
let inbox=[];window.lastTitles={};
async function poll(){if(!$('oa').value)return;inbox=await (await fetch(api+'/outbox?oaId='+encodeURIComponent($('oa').value)+'&userId='+encodeURIComponent($('uid').value),{credentials:'omit'})).json();render();}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function render(){const items=[...mine,...inbox.map(e=>({...e,me:false}))].sort((a,b)=>a.at<b.at?-1:1);
 $('chat').innerHTML=items.map(e=>{if(e.me)return '<div class="msg me">'+esc(e.text)+'</div>';
  if(e.channel==='template')return '<div class="msg tpl"><b>Template '+esc(e.templateId)+'</b> → '+esc(e.phone)+'<br>'+esc(JSON.stringify(e.data))+'</div>';
  const m=e.message;if(m.kind==='request_info')return '<div class="msg oa"><b>'+esc(m.title)+'</b><br>'+esc(m.subtitle)+'<div class="btns"><button onclick="send(\\'user_submit_info\\')">Share</button></div></div>';
  (m.buttons||[]).forEach(b=>window.lastTitles[b.payload]=b.title);
  return '<div class="msg oa">'+esc(m.text)+'<div class="btns">'+(m.buttons||[]).map(b=>'<button onclick="send(\\'user_send_text\\',\\''+b.payload+'\\')">'+esc(b.title)+'</button>').join('')+'</div></div>';}).join('');
 $('chat').scrollTop=1e9;}
loadOas().then(poll);setInterval(poll,3000);
</script></body></html>`;
}
