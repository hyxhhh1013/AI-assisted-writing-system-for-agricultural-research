"""Generate standalone HTML presentation file."""
import json, base64, os

# Load images
with open('/tmp/images_base64.json') as f:
    IMG = json.load(f)
with open('/tmp/figures_base64.json') as f:
    FIG = json.load(f)

P = 'D:/project/论文助手/public/presentation'

# ==============================
# HTML template
# ==============================
HTML = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>禾书耕文 GrainScript — 演示</title>
<style>
/* ===== RESET & BASE ===== */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;font-family:'PingFang SC','Microsoft YaHei','Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased}
body{background:#120106;color:#fff;transition:background .7s,background-image .8s}

/* ===== LAYOUT ===== */
#app{width:100%;height:100%;display:flex;flex-direction:column}
header{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;justify-content:space-between;align-items:center;padding:20px 32px;user-select:none}
header .brand{font-size:10px;font-weight:500;letter-spacing:.4em;color:rgba(255,255,255,.15);text-transform:uppercase;text-decoration:none}
header .tag{font-size:10px;font-weight:500;letter-spacing:.35em;color:rgba(255,255,255,.2);text-transform:uppercase}
header .counter{font-size:11px;font-family:monospace;color:rgba(255,255,255,.15)}
main{flex:1;display:flex;align-items:center;justify-content:center;z-index:10;padding:80px 48px}
footer{position:fixed;bottom:0;left:0;right:0;z-index:50;display:flex;justify-content:space-between;align-items:center;padding:20px 32px;user-select:none}
footer button{width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:rgba(255,255,255,.1);cursor:pointer;font-size:24px;transition:color .2s}
footer button:hover{color:rgba(255,255,255,.3)}
footer .dots{display:flex;align-items:center;gap:3px}
footer .dots button{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.06);border:none;cursor:pointer;padding:0;transition:all .5s}
footer .dots button.active{width:20px;height:6px;border-radius:3px;background:rgba(255,255,255,.7)}

/* ===== SLIDES ===== */
.slide{display:none;width:100%;height:100%;align-items:center;justify-content:center;text-align:center}
.slide.active{display:flex}
.slide-content{max-width:1200px;width:100%}

/* ===== TYPOGRAPHY ===== */
.t{font-size:clamp(2rem,5vw,3.75rem);font-weight:900;line-height:1.1;letter-spacing:-.02em;color:#fff;text-align:center;max-width:1100px}
.t-sm{font-size:clamp(1.5rem,3.5vw,2.5rem)}
.p{font-size:clamp(1.1rem,2vw,1.5rem);color:rgba(255,255,255,.35);font-weight:300;letter-spacing:.02em;text-align:center;max-width:800px}
.n{font-size:clamp(.85rem,1.4vw,1.1rem);color:rgba(255,255,255,.4);font-weight:300;line-height:1.6;text-align:center;max-width:800px}
.x{font-size:clamp(.7rem,1vw,.875rem);color:rgba(255,255,255,.25);font-weight:300;letter-spacing:.02em;text-align:center}
.em{color:#10b981}
.em-r{color:#f43f5e}
.big{font-size:clamp(600%,10vw,900%);font-weight:900;line-height:1;letter-spacing:-.03em;color:#fff}
.huge{font-size:clamp(800%,12vw,1100%);font-weight:900;line-height:1;letter-spacing:-.04em;color:#fff}
.b{text-align:center}.b-num{font-size:clamp(3.5rem,7vw,5rem);font-weight:900;color:#fff}.b-unit{font-size:.875rem;color:rgba(255,255,255,.3);margin-top:4px}

/* ===== LAYOUT HELPERS ===== */
.flex-col{display:flex;flex-direction:column;align-items:center;justify-content:center}
.flex-row{display:flex;align-items:center;justify-content:center;flex-wrap:wrap}
.gap-8{gap:2rem}.gap-10{gap:2.5rem}.gap-12{gap:3rem}.gap-14{gap:3.5rem}.gap-16{gap:4rem}.gap-20{gap:5rem}.gap-24{gap:6rem}.gap-32{gap:8rem}
.split{display:flex;align-items:center;justify-content:center;gap:4rem;max-width:1200px;width:100%}
.split>div{flex:1}
.card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:20px;text-align:center}
.card-icon{width:32px;height:32px;opacity:.4;margin-bottom:8px}
.card-title{font-size:1.1rem;font-weight:700;color:#fff;margin-top:8px}
.card-desc{font-size:.75rem;color:rgba(255,255,255,.3);font-weight:300;margin-top:4px}
.line-through{text-decoration:line-through;color:rgba(255,255,255,.15)}.text-xs{font-size:.75rem}
.italic{font-style:italic}.blockquote{font-size:clamp(2rem,4vw,3.75rem);font-weight:900;color:#fff;line-height:1.3;text-align:center;max-width:900px}

/* ===== IMAGES ===== */
.img-frame{border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 25px 50px -12px rgba(0,0,0,.5)}
.img-frame img{display:block;max-height:60vh;width:auto;object-fit:contain}

/* ===== PIPELINE DEMO ===== */
.pipeline-box{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:20px;font-family:monospace;font-size:12px;text-align:left;max-width:700px;margin:0 auto}
.pipeline-box .phases{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.pipeline-box .phase{padding:4px 12px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(255,255,255,.05);color:rgba(255,255,255,.4)}
.pipeline-box .phase.active{background:#10b981;color:#fff}
.pipeline-box .arrow{color:rgba(16,185,129,.6);font-size:10px}
.pipeline-box .output{padding:12px;border-radius:8px;font-size:11px;line-height:1.6;color:rgba(255,255,255,.7)}
.pipeline-box .output.writer{background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.2)}
.pipeline-box .label{font-size:10px;font-weight:700;margin-bottom:4px}

/* ===== FAKE REFS DEMO ===== */
.fake-refs{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px;font-family:monospace;font-size:10px;text-align:left;max-width:400px}
.fake-refs .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.fake-refs .ref-row{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:6px;margin-bottom:2px}
.fake-refs .ref-row.fake{background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);color:#f43f5e;text-decoration:line-through}
.fake-refs .ref-row.real{background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#10b981}
.fake-refs .ref-row.pending{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.05);color:rgba(255,255,255,.3)}
.fake-refs .badge{padding:1px 6px;border-radius:10px;font-size:9px;font-weight:700}

/* ===== CITATION CHECK ===== */
.cite-check{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px;font-family:monospace;font-size:11px;text-align:left;max-width:350px}
.cite-check .cite-row{display:flex;align-items:center;gap:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.cite-check .cite-num{color:rgba(255,255,255,.4);width:24px}
.cite-check .cite-ref{flex:1;color:rgba(255,255,255,.7)}
.cite-check .cite-status{font-weight:700;font-size:10px}
.cite-check .cite-status.pass{color:#10b981}
.cite-check .cite-status.warn{color:#f59e0b}

/* ===== PROBLEM-SOLUTION ===== */
.ps-grid{display:flex;gap:16px}
.ps-card{flex:1;position:relative;height:100px}
.ps-card .front,.ps-card .back{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:16px;padding:16px}
.ps-card .front{background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3)}
.ps-card .back{background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);opacity:0;transition:opacity .5s}
.ps-card .back.show{opacity:1}
.ps-card .front .title{font-weight:900;color:#f43f5e;font-size:14px}
.ps-card .back .title{font-weight:900;color:#10b981;font-size:14px}
.ps-card .desc{font-size:10px;color:rgba(255,255,255,.4);margin-top:4px}

/* ===== ARCHITECTURE ===== */
.arch-stack{display:flex;flex-direction:column;gap:4px;max-width:560px;width:100%}
.arch-row{display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;opacity:0;transform:translateX(-20px);transition:all .5s cubic-bezier(.22,1,.36,1)}
.arch-row.show{opacity:1;transform:translateX(0)}
.arch-badge{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff;flex-shrink:0}
.arch-icon{width:16px;height:16px;opacity:.15;flex-shrink:0}
.arch-label{flex:1;text-align:left}
.arch-label .title{font-size:14px;font-weight:700;color:rgba(255,255,255,.8)}
.arch-label .desc{font-size:11px;color:rgba(255,255,255,.25);font-weight:300}
.bg-v{background:#8b5cf6}.bg-r{background:#f43f5e}.bg-a{background:#f59e0b}.bg-s{background:#0ea5e9}.bg-e{background:#10b981}.bg-c{background:#06b6d4}

/* ===== QUALITY GRID ===== */
.q-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:700px;width:100%}
.q-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;text-align:left;opacity:0;transform:translateY(12px);transition:all .4s cubic-bezier(.22,1,.36,1)}
.q-card.show{opacity:1;transform:translateY(0)}
.q-card .q-title{font-size:14px;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:4px}
.q-card .q-desc{font-size:11px;color:rgba(255,255,255,.3);font-weight:300;line-height:1.4}

/* ===== FIGURE GRID ===== */
.fig-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:900px;width:100%}
.fig-card{background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden;text-align:center}
.fig-card img{width:100%;height:144px;object-fit:contain;padding:8px}
.fig-card .fig-label{font-size:10px;color:rgba(255,255,255,.25);padding:0 8px 8px}

/* ===== GLOW ===== */
.glow-wrap{position:relative;display:inline-block}
.glow{position:absolute;inset:0;border-radius:50%;filter:blur(80px);opacity:.2}
@keyframes pulse{0%,100%{opacity:.15}50%{opacity:.35}}

/* ===== DOT PATTERN ===== */
.dot-bg{position:fixed;inset:0;pointer-events:none;opacity:.25;background-image:radial-gradient(circle,rgba(255,255,255,.035) 1px,transparent 1px);background-size:80px 80px}

/* ===== TRANSITIONS ===== */
.fade-in{animation:fadeIn .65s cubic-bezier(.22,1,.36,1) both}
@keyframes fadeIn{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}

/* ===== RESPONSIVE ===== */
@media(max-width:768px){.split{flex-direction:column;gap:2rem}.ps-grid{flex-direction:column}.q-grid{grid-template-columns:1fr}.fig-grid{grid-template-columns:repeat(2,1fr)}main{padding:60px 24px}}
</style>
</head>
<body>
<div class="dot-bg"></div>
<div id="app">
<header>
<a class="brand" href="#">GrainScript</a>
<div style="display:flex;align-items:center;gap:24px">
<span class="tag" id="tag"></span>
<button onclick="toggleAuto()" style="background:none;border:none;color:rgba(255,255,255,.1);cursor:pointer;font-size:14px;letter-spacing:.3em;text-transform:uppercase" id="autoBtn">&#9654;</button>
<span class="counter" id="counter"></span>
</div>
</header>
<main id="main"></main>
<footer>
<button onclick="prev()">&#9664;</button>
<div class="dots" id="dots"></div>
<button onclick="next()">&#9658;</button>
</footer>
</div>

<script>
// ===== DATA =====
const ACTS = ['hook','hook','hook','hook','hook','story','story','story','story','story','research','research','research','pain','pain','pain','pain','solution','solution','solution','solution','solution','solution','solution','solution','solution','solution','results','results','results','results','process','process','close','close'];
const TAGS = ['','钩子','钩子','引子','引子','起点','自学之路','黑客松','转折','调研','方法论','方法论','新命题','痛点','痛点','痛点','解法','系统架构','知识库','领域定制','模型选型','写作管道','管道演示','引用核查','图表系统','质量保障','成果','真实案例','查重验证','用户反馈','多方向覆盖','真实过程','诚实定位','总结',''];

const BG = {
hook:     {bg:'#120106',glow:'radial-gradient(ellipse 70% 50% at 25% 30%, rgba(244,63,94,0.45) 0%, transparent 65%)'},
story:    {bg:'#140b02',glow:'radial-gradient(ellipse 70% 50% at 75% 70%, rgba(245,158,11,0.40) 0%, transparent 65%)'},
research: {bg:'#020d16',glow:'radial-gradient(ellipse 70% 50% at 80% 20%, rgba(56,189,248,0.40) 0%, transparent 65%)'},
pain:     {bg:'#14020a',glow:'radial-gradient(ellipse 70% 50% at 20% 50%, rgba(225,29,72,0.45) 0%, transparent 65%)'},
solution: {bg:'#02130b',glow:'radial-gradient(ellipse 70% 50% at 25% 65%, rgba(16,185,129,0.45) 0%, transparent 65%)'},
results:  {bg:'#02141a',glow:'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(6,182,212,0.45) 0%, transparent 65%)'},
process:  {bg:'#0b0418',glow:'radial-gradient(ellipse 70% 50% at 75% 35%, rgba(139,92,246,0.40) 0%, transparent 65%)'},
close:    {bg:'#100d04',glow:'radial-gradient(ellipse 70% 50% at 50% 25%, rgba(251,191,36,0.30) 0%, transparent 65%)'},
};

let idx=0,auto=false,autoTimer=null;
function next(){idx=(idx+1)%35;render()}
function prev(){idx=(idx-1+35)%35;render()}
function go(i){idx=i;render()}
function toggleAuto(){auto=!auto;document.getElementById('autoBtn').textContent=auto?'⏸':'▶';if(auto)autoTimer=setInterval(next,20000);else clearInterval(autoTimer)}

document.addEventListener('keydown',e=>{
if(e.key==='ArrowRight'||e.key===' ')next();
if(e.key==='ArrowLeft')prev();
});

function render(){
const act=ACTS[idx];
document.body.style.background=BG[act].bg;
document.body.style.backgroundImage=BG[act].glow;
document.getElementById('tag').textContent=TAGS[idx];
document.getElementById('counter').textContent=String(idx+1).padStart(2,'0')+' / 35';
document.querySelectorAll('.slide').forEach(s=>s.classList.remove('active'));
const s=document.getElementById('s'+idx);
if(s){s.classList.add('active');resetAnims(s)}
document.querySelectorAll('#dots button').forEach((b,i)=>b.classList.toggle('active',i===idx));
}

function resetAnims(el){
el.querySelectorAll('.arch-row').forEach((r,i)=>{r.classList.remove('show');setTimeout(()=>r.classList.add('show'),400+i*250)});
el.querySelectorAll('.q-card').forEach((c,i)=>{c.classList.remove('show');setTimeout(()=>c.classList.add('show'),400+i*200)});
el.querySelectorAll('.ps-card .back').forEach((c,i)=>{c.classList.remove('show');setTimeout(()=>c.classList.add('show'),items.length*600+1000)});
}

// Build dots
let dotsHTML='';
for(let i=0;i<35;i++){
const act=ACTS[i];
if(i>0&&act!==ACTS[i-1])dotsHTML+='<div style="width:4px"></div>';
dotsHTML+='<button onclick="go('+i+')"></button>';
}
document.getElementById('dots').innerHTML=dotsHTML;
render();
</script>
</body>
</html>'''

print("Template prepared. Now injecting slides...")
print(f"Template length: {len(HTML)} chars")
