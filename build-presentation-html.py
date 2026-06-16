"""
Build standalone HTML presentation.
Run: python build-presentation-html.py
Output: D:/project/论文助手/禾书耕文-演示.html
"""
import json, os, sys

# Load base64 images
with open('/tmp/images_base64.json') as f:
    IMG = json.load(f)
with open('/tmp/figures_base64.json') as f:
    FIG = json.load(f)

def img(name):
    """Get base64 image data for a file name."""
    if name in IMG:
        return IMG[name]
    for k in FIG:
        if k.endswith(name) or name in k:
            return FIG[k]
    return IMG.get(name, '')

def write(slides_html, outpath):
    """Write the complete standalone HTML file."""
    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>禾书耕文 GrainScript</title>
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
html,body{{width:100%;height:100%;overflow:hidden;font-family:'PingFang SC','Microsoft YaHei','Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;background:#120106;transition:background .7s,background-image .8s}}
#app{{width:100%;height:100%;display:flex;flex-direction:column}}
header{{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;justify-content:space-between;align-items:center;padding:20px 32px;user-select:none;color:rgba(255,255,255,.15);font-size:10px;font-weight:500;letter-spacing:.4em;text-transform:uppercase}}
header .brand{{color:inherit;text-decoration:none}}
header .right{{display:flex;align-items:center;gap:24px}}
header .tag{{font-size:10px;letter-spacing:.35em;color:rgba(255,255,255,.2)}}
header .counter{{font-size:11px;font-family:monospace;letter-spacing:.1em}}
header .auto-btn{{background:none;border:none;color:rgba(255,255,255,.1);cursor:pointer;font-size:14px}}
main{{flex:1;display:flex;align-items:center;justify-content:center;z-index:10;padding:80px 48px;overflow:hidden}}
footer{{position:fixed;bottom:0;left:0;right:0;z-index:50;display:flex;justify-content:space-between;align-items:center;padding:20px 32px;user-select:none}}
footer .nav-btn{{width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:rgba(255,255,255,.1);cursor:pointer;font-size:20px;transition:color .2s}}
footer .nav-btn:hover{{color:rgba(255,255,255,.35)}}
footer .dots{{display:flex;align-items:center;gap:2px}}
footer .dots .spacer{{width:4px}}
footer .dots button{{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.06);border:none;cursor:pointer;padding:0;transition:all .5s}}
footer .dots button.active{{width:20px;height:6px;border-radius:3px;background:rgba(255,255,255,.7)}}
.dot-bg{{position:fixed;inset:0;pointer-events:none;opacity:.25;background-image:radial-gradient(circle,rgba(255,255,255,.035) 1px,transparent 1px);background-size:80px 80px;z-index:0}}

.slide{{display:none;width:100%;height:100%;align-items:center;justify-content:center}}
.slide.active{{display:flex}}
.slide-inner{{max-width:1400px;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}}
.t{{font-size:clamp(2rem,5vw,3.75rem);font-weight:900;line-height:1.1;letter-spacing:-.02em;color:#fff;text-align:center}}
.t2{{font-size:clamp(1.5rem,3.5vw,2.5rem)}}
.t3{{font-size:clamp(2.5rem,6vw,4.5rem);font-weight:900;line-height:1.15;letter-spacing:-.02em;color:#fff;text-align:center}}
.p{{font-size:clamp(1rem,2vw,1.5rem);color:rgba(255,255,255,.35);font-weight:300;letter-spacing:.02em;text-align:center;max-width:800px}}
.n{{font-size:clamp(.8rem,1.4vw,1.05rem);color:rgba(255,255,255,.4);font-weight:300;line-height:1.6;text-align:center;max-width:800px}}
.x{{font-size:clamp(.65rem,1vw,.8rem);color:rgba(255,255,255,.25);font-weight:300;text-align:center}}
.em{{color:#10b981}}.emr{{color:#f43f5e}}.em-a{{color:#f59e0b}}.em-s{{color:#0ea5e9}}
.huge{{font-size:clamp(6rem,11vw,10rem);font-weight:900;line-height:1;letter-spacing:-.03em;color:#fff;text-align:center}}
.big{{font-size:clamp(4rem,8vw,7rem);font-weight:900;line-height:1;color:#fff;text-align:center}}
.b-stat{{text-align:center}}.b-stat .num{{font-size:clamp(3.5rem,6vw,4.5rem);font-weight:900;color:#fff}}.b-stat .unit{{font-size:.8rem;color:rgba(255,255,255,.3);margin-top:4px}}
.row{{display:flex;align-items:center;justify-content:center;flex-wrap:wrap}}
.col{{display:flex;flex-direction:column;align-items:center;text-align:center}}
.split{{display:flex;align-items:center;justify-content:center;gap:3rem;max-width:1200px;width:100%}}
.split>div{{flex:1;display:flex;flex-direction:column;align-items:center}}
.card{{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:20px;text-align:center}}
.card-title{{font-size:1.1rem;font-weight:700;color:#fff;margin-top:8px}}
.card-desc{{font-size:.75rem;color:rgba(255,255,255,.3);font-weight:300;margin-top:4px}}
.card-icon{{opacity:.3;margin-bottom:4px}}
.line-through{{text-decoration:line-through;color:rgba(255,255,255,.15)}}
.blockquote{{font-size:clamp(1.8rem,4vw,3rem);font-weight:900;color:#fff;line-height:1.35;text-align:center;max-width:800px}}
.img-frame{{border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 40px -10px rgba(0,0,0,.4)}}
.img-frame img{{display:block;max-height:55vh;width:auto;object-fit:contain}}
.v-divider{{width:1px;height:200px;background:rgba(255,255,255,.06)}}
.italic{{font-style:italic}}.text-xs{{font-size:.75rem}}.mt-2{{margin-top:8px}}.mt-4{{margin-top:16px}}.mt-8{{margin-top:32px}}.mb-1{{margin-bottom:4px}}.mb-2{{margin-bottom:8px}}.mb-4{{margin-bottom:16px}}
.text-white40{{color:rgba(255,255,255,.4)}}.text-white25{{color:rgba(255,255,255,.25)}}.text-white15{{color:rgba(255,255,255,.15)}}
.text-rose{{color:#f43f5e}}.text-amber{{color:#f59e0b}}.text-sky{{color:#0ea5e9}}
.font-black{{font-weight:900}}.font-bold{{font-weight:700}}.font-light{{font-weight:300}}.tracking-wide{{letter-spacing:.02em}}
.leading-relaxed{{line-height:1.65}}.leading-snug{{line-height:1.35}}.leading-tight{{line-height:1.15}}
.text-2xl{{font-size:1.5rem}}.text-3xl{{font-size:1.875rem}}.text-4xl{{font-size:2.25rem}}.text-5xl{{font-size:3rem}}.text-6xl{{font-size:3.75rem}}
.max-w-xl{{max-width:600px}}.max-w-2xl{{max-width:800px}}.max-w-3xl{{max-width:1000px}}

@keyframes pulse{{0%,100%{{opacity:.15}}50%{{opacity:.35}}}}
@keyframes fadeIn{{from{{opacity:0;transform:translateY(24px)}}to{{opacity:1;transform:translateY(0)}}}}
.fade-in{{animation:fadeIn .6s cubic-bezier(.22,1,.36,1) both}}
.fade-d1{{animation-delay:.1s}}.fade-d2{{animation-delay:.2s}}.fade-d3{{animation-delay:.3s}}.fade-d4{{animation-delay:.4s}}.fade-d5{{animation-delay:.5s}}.fade-d6{{animation-delay:.6s}}.fade-d8{{animation-delay:.8s}}.fade-d10{{animation-delay:1s}}.fade-d12{{animation-delay:1.2s}}.fade-d15{{animation-delay:1.5s}}.fade-d20{{animation-delay:2s}}

@media(max-width:768px){{.split{{flex-direction:column;gap:2rem}}main{{padding:40px 16px}}}}
</style>
</head>
<body>
<div class="dot-bg"></div>
<div id="app">
<header>
<a class="brand" href="#">GrainScript</a>
<div class="right">
<span class="tag" id="tag"></span>
<button class="auto-btn" id="autoBtn" onclick="toggleAuto()">&#9654;</button>
<span class="counter" id="counter"></span>
</div>
</header>
<main id="main">
{slides_html}
</main>
<footer>
<button class="nav-btn" onclick="prev()">&#9664;</button>
<div class="dots" id="dots"></div>
<button class="nav-btn" onclick="next()">&#9658;</button>
</footer>
</div>

<script>
const ACTS=['hook','hook','hook','hook','hook','story','story','story','story','story','research','research','research','pain','pain','pain','pain','solution','solution','solution','solution','solution','solution','solution','solution','solution','solution','results','results','results','results','process','process','close','close'];
const TAGS=['','钩子','钩子','引子','引子','起点','自学之路','黑客松','转折','调研','方法论','方法论','新命题','痛点','痛点','痛点','解法','系统架构','知识库','领域定制','模型选型','写作管道','管道演示','引用核查','图表系统','质量保障','成果','真实案例','查重验证','用户反馈','多方向覆盖','真实过程','诚实定位','总结',''];
const BG={{hook:{{bg:'#120106',glow:'radial-gradient(ellipse 70% 50% at 25% 30%, rgba(244,63,94,0.45) 0%, transparent 65%)'}},story:{{bg:'#140b02',glow:'radial-gradient(ellipse 70% 50% at 75% 70%, rgba(245,158,11,0.40) 0%, transparent 65%)'}},research:{{bg:'#020d16',glow:'radial-gradient(ellipse 70% 50% at 80% 20%, rgba(56,189,248,0.40) 0%, transparent 65%)'}},pain:{{bg:'#14020a',glow:'radial-gradient(ellipse 70% 50% at 20% 50%, rgba(225,29,72,0.45) 0%, transparent 65%)'}},solution:{{bg:'#02130b',glow:'radial-gradient(ellipse 70% 50% at 25% 65%, rgba(16,185,129,0.45) 0%, transparent 65%)'}},results:{{bg:'#02141a',glow:'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(6,182,212,0.45) 0%, transparent 65%)'}},process:{{bg:'#0b0418',glow:'radial-gradient(ellipse 70% 50% at 75% 35%, rgba(139,92,246,0.40) 0%, transparent 65%)'}},close:{{bg:'#100d04',glow:'radial-gradient(ellipse 70% 50% at 50% 25%, rgba(251,191,36,0.30) 0%, transparent 65%)'}}}};
let idx=0,auto=false,autoTimer=null;
function next(){{idx=(idx+1)%35;render()}}
function prev(){{idx=(idx-1+35)%35;render()}}
function go(i){{idx=i;render()}}
function toggleAuto(){{auto=!auto;document.getElementById('autoBtn').textContent=auto?'⏸':'▶';if(auto)autoTimer=setInterval(next,20000);else clearInterval(autoTimer)}}
document.addEventListener('keydown',e=>{{if(e.key==='ArrowRight'||e.key===' '){{e.preventDefault();next()}}if(e.key==='ArrowLeft'){{e.preventDefault();prev()}}}});
function render(){{
const act=ACTS[idx];
document.body.style.background=BG[act].bg;
document.body.style.backgroundImage=BG[act].glow;
document.getElementById('tag').textContent=TAGS[idx];
document.getElementById('counter').textContent=String(idx+1).padStart(2,'0')+' / 35';
document.querySelectorAll('.slide').forEach(s=>s.classList.remove('active'));
const s=document.getElementById('s'+idx);
if(s){{s.classList.add('active');resetAnims(s)}}
document.querySelectorAll('#dots button.dot').forEach((b,i)=>b.classList.toggle('active',i===idx));
}}
function resetAnims(el){{el.querySelectorAll('.arch-row').forEach((r,i)=>{{r.classList.remove('show');setTimeout(()=>r.classList.add('show'),300+i*250)}});el.querySelectorAll('.q-card').forEach((c,i)=>{{c.classList.remove('show');setTimeout(()=>c.classList.add('show'),300+i*200)}});}}
// Build dots
let dh='';
for(let i=0;i<35;i++){{if(i>0&&ACTS[i]!==ACTS[i-1])dh+='<div class="spacer"></div>';dh+='<button class="dot" onclick="go('+i+')"></button>';}}
document.getElementById('dots').innerHTML=dh;
render();
</script>
</body>
</html>'''
    with open(outpath, 'w', encoding='utf-8') as f:
        f.write(html)
    size = os.path.getsize(outpath)
    print(f'Written: {outpath} ({size//1024}KB)')

# ============================================================
# BUILD SLIDES
# ============================================================
def build_slides():
    slides = []

    # 1. Cover
    slides.append('''<div class="slide" id="s0"><div class="slide-inner" style="gap:56px">
<div style="position:relative;display:inline-block"><div style="position:absolute;inset:0;background:#10b981;border-radius:50%;filter:blur(80px);opacity:.2;animation:pulse 3s infinite"></div><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" style="position:relative"><path d="M12 2L8 6l4 4-4 4 4 4-4 4"/></svg></div>
<div style="text-align:center"><h1 class="huge" style="font-size:clamp(4rem,9vw,7rem);letter-spacing:-.04em">禾书耕文</h1><p style="font-size:clamp(1.2rem,2.5vw,1.8rem);color:rgba(16,185,129,.5);font-weight:300;letter-spacing:.25em;margin-top:12px">GrainScript</p></div>
<p class="n fade-in">一个大二学生用 AI 做的农业科研写作系统</p>
<div class="fade-in fade-d12" style="text-align:center;margin-top:48px"><p style="color:rgba(255,255,255,.45)">黄奕轩</p><p class="x" style="letter-spacing:.3em">计算机科学与技术 · 2026.06</p></div>
</div></div>''')

    # 2. Scene
    slides.append('''<div class="slide" id="s1"><div class="slide-inner" style="gap:48px">
<p class="fade-in" style="font-size:clamp(1.5rem,3vw,2.25rem);color:rgba(255,255,255,.7);font-weight:300">想象一下——</p>
<p class="t fade-in fade-d6">你做了三年试验<br>终于要写论文了</p>
<p class="fade-in fade-d15" style="font-size:clamp(1rem,1.8vw,1.25rem);color:rgba(255,255,255,.3);font-weight:300;line-height:1.8;text-align:center;max-width:600px">打开 AI，输入题目。<br>它流畅地列出了参考文献——<br>格式完美，DOI 齐全。<br>你心想：<span class="em">终于可以交差了。</span></p>
</div></div>''')

    # 3. Reversal
    slides.append('''<div class="slide" id="s2"><div class="slide-inner" style="gap:40px">
<p class="fade-in" style="font-size:clamp(3rem,7vw,5rem);font-weight:900;color:#f43f5e;text-align:center;line-height:1.2">"参考文献 [3]<br>不存在，请核实。"</p>
<p class="fade-in fade-d10" style="font-size:clamp(1rem,1.8vw,1.25rem);color:rgba(255,255,255,.4);font-weight:300">— 审稿人回信</p>
<p class="n fade-in fade-d18">你一个个去查。<br>10 条引用，超过一半查不到。<br>你慌了：<span style="color:rgba(244,63,94,.7)">到底还有多少是编的？</span></p>
</div></div>''')

    # 4. 8/10
    slides.append('''<div class="slide" id="s3"><div class="slide-inner" style="gap:32px">
<p class="huge fade-in">8 / 10</p>
<p class="p fade-in fade-d5">AI 生成的参考文献是编造的</p>
<p class="n fade-in fade-d10">去年 12 月，我让 ChatGPT 写文献综述。<br>它列了 10 条参考文献，格式完美，DOI 齐全。<br>我去查了——8 条不存在。</p>
</div></div>''')

    # 5. 60-80%
    slides.append('''<div class="slide" id="s4"><div class="slide-inner" style="gap:32px">
<p class="huge fade-in"><span class="em">60</span>–80<span style="font-size:1.5rem;vertical-align:super">%</span></p>
<p class="p fade-in fade-d5">AI 编造引用的概率</p>
<p class="n fade-in fade-d8">Nature (2024) · 不是个人遭遇，是系统性问题</p>
<p class="fade-in fade-d14" style="font-size:clamp(1rem,1.8vw,1.25rem);color:rgba(255,255,255,.5);font-weight:300;font-style:italic">它看起来很专业。但<span class="emr">你不能信它</span>。</p>
</div></div>''')

    # 6. Starting point
    slides.append('''<div class="slide" id="s5"><div class="slide-inner" style="gap:32px">
<p class="t fade-in">2025 年 12 月</p>
<p class="p fade-in fade-d3">我连 React 都不会</p>
<div class="row fade-in fade-d10" style="gap:64px">
<div class="col"><p class="text-xs text-white15">技能</p><p style="color:rgba(255,255,255,.4);font-weight:300;font-size:.9rem">HTML, CSS, 一点点 JS</p></div>
<div class="col"><p class="text-xs text-white15">React</p><p style="color:rgba(255,255,255,.4);font-weight:300;font-size:.9rem">听说过但不会</p></div>
<div class="col"><p class="text-xs text-white15">全栈</p><p style="color:rgba(255,255,255,.4);font-weight:300;font-size:.9rem">不知道什么意思</p></div>
</div>
<p class="x fade-in fade-d20">但我对 AI 能做什么充满了好奇</p>
</div></div>''')

    # 7. Self-learning
    slides.append('''<div class="slide" id="s6"><div class="slide-inner" style="gap:48px">
<p class="t fade-in">自己琢磨的 3 个月</p>
<div class="row fade-in fade-d3" style="gap:0">
<div class="col" style="gap:8px"><p style="font-size:.75rem;color:rgba(16,185,129,.4);font-family:monospace">12月</p><p style="font-size:1.1rem;font-weight:700;color:#fff">从零自学</p><p style="font-size:.8rem;color:rgba(255,255,255,.3)">跟着 AI 学 React / Next.js</p></div>
<div style="width:48px;height:1px;background:rgba(255,255,255,.1)"></div>
<div class="col" style="gap:8px"><p style="font-size:.75rem;color:rgba(16,185,129,.4);font-family:monospace">1月</p><p style="font-size:1.1rem;font-weight:700;color:#fff">第一个全栈项目</p><p style="font-size:.8rem;color:rgba(255,255,255,.3)">个人网站 hyxhhh.site</p></div>
<div style="width:48px;height:1px;background:rgba(255,255,255,.1)"></div>
<div class="col" style="gap:8px"><p style="font-size:.75rem;color:rgba(16,185,129,.4);font-family:monospace">2月</p><p style="font-size:1.1rem;font-weight:700;color:#fff">Trae 黑客松</p><p style="font-size:.8rem;color:rgba(255,255,255,.3)">卓工院 × 字节跳动</p></div>
<div style="width:48px;height:1px;background:rgba(255,255,255,.1)"></div>
<div class="col" style="gap:8px"><p style="font-size:.75rem;color:rgba(16,185,129,.4);font-family:monospace">3月</p><p style="font-size:1.1rem;font-weight:700;color:#fff">三等奖 🏆</p><p style="font-size:.8rem;color:rgba(255,255,255,.3)">AI 原生能力被看见</p></div>
</div>
<p class="x fade-in fade-d15">Vite + React + Ant Design + Framer Motion · 独立部署 · 运行在个人 VPS</p>
</div></div>''')

    # 8. Hackathon
    slides.append('''<div class="slide" id="s7"><div class="slide-inner" style="gap:32px">
<div class="fade-in" style="position:relative;display:inline-block"><div style="position:absolute;inset:0;background:#f59e0b;border-radius:50%;filter:blur(60px);opacity:.3;animation:pulse 2.5s infinite"></div><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(245,158,11,.7)" stroke-width="1.5" style="position:relative"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M6 9v2m0-2h12v2M6 11v7a2 2 0 002 2h8a2 2 0 002-2v-7"/></svg></div>
<p class="t fade-in fade-d3">卓工院 × 字节跳动</p>
<p class="p fade-in fade-d6">Trae 黑客松 · 三等奖</p>
<p class="n fade-in fade-d10">用 AI 工具链快速交付完整项目<br>AI 原生开发能力第一次被看见</p>
</div></div>''')

    # 9. Invitation
    slides.append('''<div class="slide" id="s8"><div class="slide-inner" style="gap:48px">
<p class="n fade-in">获奖后，刘怡老师让徐智航联系了获奖同学</p>
<p class="blockquote fade-in fade-d8">「要不要跟着我去筹建<span class="em">智慧农业创新中心</span>？」</p>
<p class="fade-in fade-d16" style="font-size:clamp(1rem,1.8vw,1.25rem);color:rgba(255,255,255,.25);font-weight:300">— 周院长</p>
<p class="x fade-in fade-d24">这个奖不是终点，是起点。</p>
</div></div>''')

    # 10. Research trips
    slides.append('''<div class="slide" id="s9"><div class="slide-inner" style="gap:40px">
<p class="t fade-in">跟着周院长，走进真实世界</p>
<div class="row fade-in fade-d4" style="gap:80px">
<div class="col" style="gap:4px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><p style="font-size:1.2rem;font-weight:700;color:#fff;margin-top:12px">山姆会员店</p><p style="font-size:.8rem;color:rgba(255,255,255,.3)">终端零售标准</p></div>
<div class="col" style="gap:4px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="1.5"><path d="M12 2L8 6l4 4-4 4 4 4-4 4"/></svg><p style="font-size:1.2rem;font-weight:700;color:#fff;margin-top:12px">东升农场</p><p style="font-size:.8rem;color:rgba(255,255,255,.3)">年产值 18 亿</p></div>
<div class="col" style="gap:4px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><p style="font-size:1.2rem;font-weight:700;color:#fff;margin-top:12px">红星农批</p><p style="font-size:.8rem;color:rgba(255,255,255,.3)">年交易 700 亿</p></div>
<div class="col" style="gap:4px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg><p style="font-size:1.2rem;font-weight:700;color:#fff;margin-top:12px">大队长农业</p><p style="font-size:.8rem;color:rgba(255,255,255,.3)">农机共享</p></div>
</div>
<div class="row fade-in fade-d12" style="gap:96px"><div class="b-stat"><div class="num">4</div><div class="unit">企业走访</div></div><div class="b-stat"><div class="num">163</div><div class="unit">页调研报告</div></div></div>
</div></div>''')

    # 11. Questioning
    slides.append('''<div class="slide" id="s10"><div class="slide-inner" style="gap:48px">
<p class="t fade-in">调研教会我：<br>怎么<span class="em">发现真实问题</span></p>
<div class="fade-in fade-d8" style="display:flex;flex-direction:column;gap:20px;max-width:800px;width:100%">
<div style="display:flex;align-items:center;gap:20px"><span style="font-size:.75rem;font-family:monospace;color:rgba(245,158,11,.3);width:20px;text-align:right">1</span><p style="font-size:1.1rem;color:rgba(255,255,255,.55);font-weight:300">「你们量最大的是什么？」</p></div>
<div style="display:flex;align-items:center;gap:20px"><span style="font-size:.75rem;font-family:monospace;color:rgba(245,158,11,.3);width:20px;text-align:right">2</span><p style="font-size:1.1rem;color:rgba(255,255,255,.55);font-weight:300">「用工最多的环节是什么？」</p></div>
<div style="display:flex;align-items:center;gap:20px"><span style="font-size:.75rem;font-family:monospace;color:rgba(245,158,11,.3);width:20px;text-align:right">3</span><p style="font-size:1.1rem;color:rgba(255,255,255,.55);font-weight:300">「你们最想解决什么问题？」</p></div>
<div style="display:flex;align-items:center;gap:20px"><span style="font-size:.75rem;font-family:monospace;color:rgba(245,158,11,.3);width:20px;text-align:right">4</span><p style="font-size:1.1rem;color:rgba(255,255,255,.55);font-weight:300">「你们愿意投多少钱？」</p></div>
</div>
<p class="fade-in fade-d22" style="font-size:.9rem;color:rgba(255,255,255,.2);font-weight:300;font-style:italic;text-align:center;max-width:600px">企业说的问题，不一定是真问题。<br>企业没说的问题，可能才是真问题。</p>
</div></div>''')

    # 12. Framework
    slides.append('''<div class="slide" id="s11"><div class="slide-inner" style="gap:56px">
<p class="t fade-in">从调研到工程：<br>一套方法论</p>
<div class="row fade-in fade-d4" style="gap:32px">
<div class="col" style="gap:8px"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><p style="font-size:1rem;font-weight:500;color:rgba(255,255,255,.6);margin-top:8px">发现真实问题</p></div>
<p style="color:rgba(255,255,255,.1);font-size:1.25rem">→</p>
<div class="col" style="gap:8px"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0"/></svg><p style="font-size:1rem;font-weight:500;color:rgba(255,255,255,.6);margin-top:8px">分析根因</p></div>
<p style="color:rgba(255,255,255,.1);font-size:1.25rem">→</p>
<div class="col" style="gap:8px"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg><p style="font-size:1rem;font-weight:500;color:rgba(255,255,255,.6);margin-top:8px">技术方案</p></div>
<p style="color:rgba(255,255,255,.1);font-size:1.25rem">→</p>
<div class="col" style="gap:8px"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><p style="font-size:1rem;font-weight:500;color:rgba(255,255,255,.6);margin-top:8px">快速验证</p></div>
</div>
<p class="n fade-in fade-d15">这套方法不只适用于产业调研。<br>任何需要用技术解决的问题，都适用。</p>
</div></div>''')

    # 13. Director question
    slides.append('''<div class="slide" id="s12"><div class="slide-inner" style="gap:56px">
<p class="n fade-in">周院长看到短视频说 <span class="em">AI 能一键生成论文</span></p>
<p class="fade-in fade-d6 t3">实验室有些同学<br><span class="emr">三年</span>写不出一篇论文</p>
<p class="fade-in fade-d12" style="font-size:clamp(1.2rem,2.5vw,1.8rem);color:rgba(16,185,129,.6);font-weight:300">「能不能用 AI 帮忙？」</p>
<p class="x fade-in fade-d20">但我没有马上动手——先用方法论分析问题。</p>
</div></div>''')

    # 14. Real pain points
    slides.append('''<div class="slide" id="s13"><div class="slide-inner" style="gap:48px">
<p class="t fade-in">用追问的方法<br>找到真正的痛点</p>
<div class="row fade-in fade-d5" style="gap:80px">
<div class="col" style="gap:8px;max-width:200px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p class="line-through mt-2">「写不出来」</p><p style="font-size:1.2rem;font-weight:700;color:#fff;line-height:1.3;margin-top:8px">不是写不出来<br>是引用造假</p><p style="font-size:.8rem;color:rgba(255,255,255,.3);margin-top:8px;line-height:1.5">AI 编造的引用格式完美<br>但查无此文</p></div>
<div class="col" style="gap:8px;max-width:200px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg><p class="line-through mt-2">「不会写」</p><p style="font-size:1.2rem;font-weight:700;color:#fff;line-height:1.3;margin-top:8px">不是不会写<br>是不懂规范</p><p style="font-size:.8rem;color:rgba(255,255,255,.3);margin-top:8px;line-height:1.5">通用 AI 不了解<br>农业科研写作规则</p></div>
<div class="col" style="gap:8px;max-width:200px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p class="line-through mt-2">「能力差」</p><p style="font-size:1.2rem;font-weight:700;color:#fff;line-height:1.3;margin-top:8px">不是能力差<br>是时间花在机械劳动</p><p style="font-size:.8rem;color:rgba(255,255,255,.3);margin-top:8px;line-height:1.5">排版·核对·格式化<br>占 80% 时间</p></div>
</div>
<p class="n fade-in fade-d15">关键洞察：根因不是「人不行」——是<span class="em">AI 用错了方式</span></p>
</div></div>''')

    # 15. Fake citation demo
    slides.append(f'''<div class="slide" id="s14"><div class="slide-inner"><div class="split">
<div style="text-align:center;gap:24px">
<p class="t3">10 条引用<br><span class="emr">8 条是编的</span></p>
<p class="n fade-in fade-d5">格式完美 · DOI 齐全 · 查无此文</p>
</div>
<div class="fade-in fade-d4">
<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px;font-family:monospace;font-size:10px;text-align:left;max-width:400px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
<p style="color:rgba(255,255,255,.4);font-weight:700;font-size:10px">ChatGPT 生成的参考文献</p>
<span style="background:rgba(244,63,94,.2);color:#f43f5e;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">8/10 条是编的</span>
</div>
<div style="display:flex;flex-direction:column;gap:2px">
<div style="background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:8px"><span style="color:rgba(255,255,255,.3);width:16px">1.</span><span style="color:#f43f5e;text-decoration:line-through;flex:1">Wang et al. (2023). Nature Comms.</span><span style="color:#f43f5e;font-weight:700;font-size:9px">✗ 编造</span></div>
<div style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:8px"><span style="color:rgba(255,255,255,.3);width:16px">2.</span><span style="color:#10b981;flex:1">Chen & Li (2022). Soil Bio. Biochem.</span><span style="color:#10b981;font-weight:700;font-size:9px">✓ 真实</span></div>
<div style="background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:8px"><span style="color:rgba(255,255,255,.3);width:16px">3.</span><span style="color:#f43f5e;text-decoration:line-through;flex:1">Zhang et al. (2024). Environ. Sci. Tech.</span><span style="color:#f43f5e;font-weight:700;font-size:9px">✗ 编造</span></div>
<div style="background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:8px"><span style="color:rgba(255,255,255,.3);width:16px">4.</span><span style="color:#f43f5e;text-decoration:line-through;flex:1">Liu et al. (2023). Bioresource Tech.</span><span style="color:#f43f5e;font-weight:700;font-size:9px">✗ 编造</span></div>
<div style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:8px"><span style="color:rgba(255,255,255,.3);width:16px">5.</span><span style="color:#10b981;flex:1">Huang et al. (2023). Agri. Eco. Environ.</span><span style="color:#10b981;font-weight:700;font-size:9px">✓ 真实</span></div>
<div style="background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:8px"><span style="color:rgba(255,255,255,.3);width:16px">6.</span><span style="color:#f43f5e;text-decoration:line-through;flex:1">Kim et al. (2024). Scientific Reports</span><span style="color:#f43f5e;font-weight:700;font-size:9px">✗ 编造</span></div>
</div>
<p style="color:#f43f5e;font-weight:700;font-size:10px;text-align:center;margin-top:8px">ChatGPT 看起来很专业，但 8 条引用根本不存在</p>
</div>
</div>
</div></div></div>''')

    # 16. Domain + mechanical
    slides.append('''<div class="slide" id="s15"><div class="slide-inner" style="gap:80px">
<div style="text-align:center"><p class="t3 fade-in">不懂<span class="em-a">领域</span></p><p class="n fade-in fade-d3">通用 AI 不了解农业科研写作规范<br>Overclaim 措辞 · 证据强度 · 田间试验设计<br>看起来专业，审稿人一眼看穿</p></div>
<div style="text-align:center"><p class="t3 fade-in fade-d8">机械<span style="color:#0ea5e9">劳动</span></p><p class="n fade-in fade-d11">排版 · 核对引用 · 格式化<br>占了 <span style="color:rgba(255,255,255,.7);font-weight:700">80%</span> 的时间<br>只有 <span class="em">20%</span> 用在真正的科学思考上</p></div>
</div></div>''')

    # 17. Three solutions
    slides.append('''<div class="slide" id="s16"><div class="slide-inner" style="gap:40px">
<p class="t fade-in">三个问题，三层解法</p>
<div class="row fade-in fade-d5" style="gap:16px">
<div class="card" style="position:relative;width:200px;height:100px"><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:16px"><p style="font-weight:900;color:#f43f5e;font-size:14px">引用虚构</p><p style="font-size:10px;color:rgba(255,255,255,.4);margin-top:4px">AI 编造不存在的论文</p></div></div>
<div class="card" style="position:relative;width:200px;height:100px"><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:16px"><p style="font-weight:900;color:#f43f5e;font-size:14px">不懂领域</p><p style="font-size:10px;color:rgba(255,255,255,.4);margin-top:4px">通用 AI 不了解农业规范</p></div></div>
<div class="card" style="position:relative;width:200px;height:100px"><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);border-radius:16px"><p style="font-weight:900;color:#f43f5e;font-size:14px">机械劳动</p><p style="font-size:10px;color:rgba(255,255,255,.4);margin-top:4px">排版、核对、格式化</p></div></div>
</div>
<div class="row fade-in fade-d10" style="gap:96px">
<div class="col" style="gap:4px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><p style="font-size:1.1rem;font-weight:700;color:#fff;margin-top:8px">RAG 知识库</p><p style="font-size:.75rem;color:rgba(255,255,255,.3)">只引用真实论文</p></div>
<div class="col" style="gap:4px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg><p style="font-size:1.1rem;font-weight:700;color:#fff;margin-top:8px">领域 Prompt</p><p style="font-size:.75rem;color:rgba(255,255,255,.3)">8 个深度定制文件</p></div>
<div class="col" style="gap:4px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg><p style="font-size:1.1rem;font-weight:700;color:#fff;margin-top:8px">多 Agent</p><p style="font-size:.75rem;color:rgba(255,255,255,.3)">写→审→改自动管道</p></div>
</div>
<p class="fade-in fade-d18" style="font-size:1.1rem;color:rgba(255,255,255,.4);font-weight:300;font-style:italic;text-align:center;max-width:600px">AI 是加速器，不是自动驾驶。<br>科学判断必须你自己把关。</p>
</div></div>''')

    # 18. Architecture
    slides.append('''<div class="slide" id="s17"><div class="slide-inner" style="gap:40px">
<p class="t fade-in">六层<span class="em">架构</span></p>
<p class="p fade-in fade-d3">从数据到导出，每一层解决一个具体问题</p>
<div class="arch-stack fade-in fade-d6">
<div class="arch-row"><div class="arch-badge bg-v">6</div><svg class="arch-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><div class="arch-label"><div class="title">导出层</div><div class="desc">PDF / Word · 4 种模板 · 自动排版</div></div></div>
<div class="arch-row"><div class="arch-badge bg-r">5</div><svg class="arch-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><div class="arch-label"><div class="title">质量保障</div><div class="desc">引用核查 · 一致性审查 · 查重 · Overclaim 检测</div></div></div>
<div class="arch-row"><div class="arch-badge bg-a">4</div><svg class="arch-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><div class="arch-label"><div class="title">多 Agent 协作</div><div class="desc">Writer (DeepSeek) → Verifier (GLM-4) → Refiner</div></div></div>
<div class="arch-row"><div class="arch-badge bg-s">3</div><svg class="arch-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg><div class="arch-label"><div class="title">Prompt 工程</div><div class="desc">IMRAD 结构 · 证据强度 · 8 个领域文件</div></div></div>
<div class="arch-row"><div class="arch-badge bg-e">2</div><svg class="arch-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg><div class="arch-label"><div class="title">RAG 知识库</div><div class="desc">910 篇论文 · BM25 + 向量 · RRF 融合检索</div></div></div>
<div class="arch-row"><div class="arch-badge bg-c">1</div><svg class="arch-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><div class="arch-label"><div class="title">数据与图表</div><div class="desc">14 种图表 · XRD 峰拟合 · 三线表 · 分子结构</div></div></div>
</div>
<p class="n fade-in fade-d12">不是堆功能。是分层解耦的工程设计。</p>
</div></div>''')

    # 19. RAG
    slides.append('''<div class="slide" id="s18"><div class="slide-inner" style="gap:40px">
<p class="t fade-in"><span class="em">RAG</span> 知识库</p>
<div class="row fade-in fade-d4" style="gap:96px"><div class="b-stat"><div class="num">910</div><div class="unit">篇已索引论文</div></div><div class="b-stat"><div class="num">7</div><div class="unit">个学科分类</div></div><div class="b-stat"><div class="num">12,000+</div><div class="unit">个知识块</div></div></div>
<div class="row fade-in fade-d10" style="gap:56px"><span style="color:rgba(255,255,255,.4);font-weight:300;font-size:.9rem">控释肥 100篇</span><span style="color:rgba(255,255,255,.4);font-weight:300;font-size:.9rem">茶学 178篇</span><span style="color:rgba(255,255,255,.4);font-weight:300;font-size:.9rem">烟草 142篇</span><span style="color:rgba(255,255,255,.4);font-weight:300;font-size:.9rem">热化学 167篇</span><span style="color:rgba(255,255,255,.4);font-weight:300;font-size:.9rem">热解 139篇</span><span style="color:rgba(255,255,255,.4);font-weight:300;font-size:.9rem">烟花 184篇</span></div>
<p class="n fade-in fade-d15">AI 只能引用库里真实存在的论文<br>每条引用都可追溯到原文</p>
<p class="x fade-in fade-d20">四个方向的老师和同学帮忙收集了这些论文</p>
</div></div>''')

    # 20. Domain prompts
    prompts_list = ['证据强度分级 · 禁止「首次」「证明」等过度措辞','Results 句式铁律 · 客观报告，含统计检验和重复数','Discussion 逻辑链 · 发现→机制→对比→局限→展望','田间试验设计规范 · 地点、品种、设计、重复次数','Overclaim 检测 · 全文扫描，避免「最优」「最好」','GB/T 7713 格式 · 三线表、引用标注、章节结构','品种命名规范 · 拉丁学名、品种代号、处理编号','数据溯源要求 · 每个数字和结论标注数据来源']
    prompt_items = ''.join(f'<div style="display:flex;align-items:center;gap:12px"><span style="font-size:10px;font-family:monospace;color:rgba(16,185,129,.25);width:20px;text-align:right;flex-shrink:0">{i+1}</span><p style="font-size:.85rem;color:rgba(255,255,255,.45);font-weight:300">{p}</p></div>' for i,p in enumerate(prompts_list))
    slides.append(f'''<div class="slide" id="s19"><div class="slide-inner" style="gap:40px">
<p class="t fade-in">8 个<span class="em"> Prompt</span> 文件</p>
<div class="fade-in fade-d7" style="display:flex;flex-direction:column;gap:10px;max-width:800px;width:100%">{prompt_items}</div>
<p class="n fade-in fade-d20">把农业科研写作规范编码进系统</p>
</div></div>''')

    # 21. Why two models
    slides.append('''<div class="slide" id="s20"><div class="slide-inner" style="gap:40px">
<p class="t fade-in">为什么用<span class="em">两个</span>不同的模型？</p>
<div class="row fade-in fade-d4" style="gap:24px">
<div class="card" style="flex:1;max-width:280px;border-color:rgba(59,130,246,.2);background:rgba(59,130,246,.06)"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(59,130,246,.5)" stroke-width="1.5" class="card-icon"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><p class="card-title">Writer</p><p style="font-size:10px;color:rgba(59,130,246,.3);font-family:monospace;margin-top:2px">DeepSeek</p><p style="font-size:.75rem;color:rgba(255,255,255,.35);font-weight:300;line-height:1.5;margin-top:8px">写作能力强<br>成本低，适合长篇生成<br>按 IMRAD 结构逐节起草</p></div>
<div class="card" style="flex:1;max-width:280px;border-color:rgba(16,185,129,.2);background:rgba(16,185,129,.06)"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.5)" stroke-width="1.5" class="card-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><p class="card-title">Verifier</p><p style="font-size:10px;color:rgba(16,185,129,.3);font-family:monospace;margin-top:2px">智谱 GLM-4</p><p style="font-size:.75rem;color:rgba(255,255,255,.35);font-weight:300;line-height:1.5;margin-top:8px">独立模型，不同架构<br>拿到原文逐条比对<br>杜绝"自己审自己"</p></div>
</div>
<div class="fade-in fade-d8" style="display:flex;align-items:center;gap:12px;padding:12px 20px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:12px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(245,158,11,.5)" stroke-width="1.5"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0"/></svg><p style="font-size:.85rem;color:rgba(255,255,255,.5);font-weight:300">自己写、自己审、自己改——<span style="color:rgba(245,158,11,.8);font-weight:500">永远发现不了问题</span></p></div>
<p class="fade-in fade-d12" style="font-size:.7rem;color:rgba(255,255,255,.15);font-weight:300;text-align:center">学术依据：Chain-of-Verification Reduces Hallucination · Dhuliawala et al., 2024</p>
</div></div>''')

    # 22. Pipeline explain
    slides.append('''<div class="slide" id="s21"><div class="slide-inner" style="gap:40px">
<p class="t fade-in">Writer → Verifier → Refiner</p>
<div class="row fade-in fade-d4" style="gap:64px">
<div class="col" style="gap:8px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><p style="font-size:1.5rem;font-weight:700;color:#fff;margin-top:12px">Writer</p><p style="font-size:10px;color:rgba(16,185,129,.3);font-family:monospace">DeepSeek</p><p style="font-size:.85rem;color:rgba(255,255,255,.35);font-weight:300;margin-top:8px;max-width:220px">按 IMRAD 结构逐节生成初稿</p></div>
<div class="col" style="gap:8px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><p style="font-size:1.5rem;font-weight:700;color:#fff;margin-top:12px">Verifier</p><p style="font-size:10px;color:rgba(16,185,129,.3);font-family:monospace">智谱 GLM-4</p><p style="font-size:.85rem;color:rgba(255,255,255,.35);font-weight:300;margin-top:8px;max-width:220px">拿到被引用文献原文，逐条比对</p></div>
<div class="col" style="gap:8px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg><p style="font-size:1.5rem;font-weight:700;color:#fff;margin-top:12px">Refiner</p><p style="font-size:10px;color:rgba(16,185,129,.3);font-family:monospace">DeepSeek</p><p style="font-size:.85rem;color:rgba(255,255,255,.35);font-weight:300;margin-top:8px;max-width:220px">根据审查意见修正，只改错不删观点</p></div>
</div>
<p class="n fade-in fade-d15">两个不同的 AI · 独立审查<br>自己审自己容易漏错 = 请了一个「挑刺的」</p>
</div></div>''')

    # 23. Pipeline demo
    slides.append('''<div class="slide" id="s22"><div class="slide-inner" style="gap:32px">
<p class="t fade-in">实际效果</p>
<div class="pipeline-box fade-in fade-d5">
<div class="phases"><div class="phase">Writer</div><div class="arrow">→</div><div class="phase active">Verifier</div><div class="arrow">→</div><div class="phase">Refiner</div></div>
<div class="output writer"><div class="label" style="color:rgba(59,130,246,.7)">Writer (DeepSeek) 生成:</div>生物质炭的施用显著提高了水稻产量。与对照处理相比，T2 处理的产量增加了 23.5%[1]。这一结果与邱良祝等[2]的研究一致，表明生物质炭能改善土壤理化性质。然而，高浓度处理（T4）的增产效果不显著（P>0.05），可能与土壤 pH 过高有关[3]。</div>
<div style="margin:12px 0;padding:12px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);border-radius:8px;font-size:11px">
<div class="label" style="color:rgba(16,185,129,.6)">Verifier (智谱 GLM-4) 核查:</div>
<div style="display:flex;align-items:center;gap:8px;margin-top:4px"><span style="color:rgba(255,255,255,.4)">[1]</span><span style="color:#10b981">✓ 通过</span></div>
<div style="display:flex;align-items:center;gap:8px"><span style="color:rgba(255,255,255,.4)">[2]</span><span style="color:#10b981">✓ 通过</span></div>
<div style="display:flex;align-items:center;gap:8px"><span style="color:rgba(255,255,255,.4)">[3]</span><span style="color:#f43f5e">✗ 归属错误</span></div>
</div>
<div class="output" style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2);border-radius:8px"><div class="label" style="color:rgba(139,92,246,.6)">Refiner 修正:</div>生物质炭的施用显著提高了水稻产量。与对照处理相比，T2 处理的产量增加了 23.5%[1]。这一结果与邱良祝等[2]的研究一致，表明生物质炭能改善土壤理化性质。然而，高浓度处理（T4）的增产效果不显著（P>0.05）[3]，需进一步验证。<p style="color:#10b981;font-weight:700;font-size:10px;margin-top:8px">已修正 1 处引用问题，保留原文风格</p></div>
</div>
<p class="n fade-in fade-d10">逐字生成 → 逐条核查 → 自动修正<br>整个过程不需要人工干预</p>
</div></div>''')

    # 24. Cite compare
    slides.append(f'''<div class="slide" id="s23"><div class="slide-inner"><div class="split">
<div style="text-align:center;gap:20px">
<p style="font-size:.75rem;color:rgba(244,63,94,.4);letter-spacing:.3em;text-transform:uppercase">ChatGPT 的引用</p>
<p class="t3" style="color:rgba(255,255,255,.6)">10 条 → <span class="emr">8 条编造</span></p>
<p style="font-size:.85rem;color:rgba(255,255,255,.25);font-weight:300">格式完美 · DOI 齐全 · 查无此文</p>
</div>
<div class="fade-in fade-d4" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px;font-family:monospace;font-size:10px;text-align:left;max-width:350px">
<p style="color:rgba(255,255,255,.4);font-weight:700;font-size:10px;margin-bottom:4px">引用真实性核查</p>
<div style="display:flex;align-items:center;gap:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:rgba(255,255,255,.4);width:20px">[1]</span><span style="flex:1;color:rgba(255,255,255,.7)">邱良祝等, 土壤, 2015</span><span style="color:#10b981;font-weight:700;font-size:10px">✓ 通过</span></div>
<div style="display:flex;align-items:center;gap:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:rgba(255,255,255,.4);width:20px">[2]</span><span style="flex:1;color:rgba(255,255,255,.7)">张斌等, 环境科学, 2021</span><span style="color:#10b981;font-weight:700;font-size:10px">✓ 通过</span></div>
<div style="display:flex;align-items:center;gap:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:rgba(255,255,255,.4);width:20px">[3]</span><span style="flex:1;color:rgba(255,255,255,.7)">Li et al., Biochar, 2023</span><span style="color:#f59e0b;font-weight:700;font-size:10px">⚠ 存疑</span></div>
<div style="display:flex;align-items:center;gap:12px;padding:4px 0"><span style="color:rgba(255,255,255,.4);width:20px">[4]</span><span style="flex:1;color:rgba(255,255,255,.7)">王明等, 农业工程学报, 2020</span><span style="color:#10b981;font-weight:700;font-size:10px">✓ 通过</span></div>
<p style="color:rgba(255,255,255,.4);font-size:10px;margin-top:8px">核查完成：3 条通过，1 条需人工确认</p>
</div>
</div></div></div>''')

    # 25. Chart system
    fig_keys = ['Fig1_TG_DTG.png','Fig2_XRD.png','Fig3_FTIR.png','Fig4_ProductDistribution.png','Fig5_GasComposition.png','Fig6_BioOilComposition.png']
    fig_labels = ['TG/DTG 热重分析','XRD 衍射图谱','FTIR 红外光谱','产物分布图','气体组成分析','生物油组分']
    fig_cards = ''.join(f'<div class="fig-card"><img src="{FIG[k]}" alt="{l}"><div class="fig-label">{l}</div></div>' for k,l in zip(fig_keys, fig_labels))
    slides.append(f'''<div class="slide" id="s24"><div class="slide-inner" style="gap:32px">
<p class="t fade-in">14 种图表，自动生成</p>
<p class="p fade-in fade-d3">不只是写文字，图也能自动画</p>
<div class="fig-grid fade-in fade-d6">{fig_cards}</div>
<p class="n fade-in fade-d14">分组柱状图 · 折线图 · 散点图 · XRD 峰拟合 · 三线表 · 分子结构<br>输入数据，自动渲染，一键插入论文正文</p>
<p class="x fade-in fade-d20">加新图只需写一个 Python 脚本 + 一条 JSON 配置，前端自动识别</p>
</div></div>''')

    # 26. Quality dimensions
    q_items = ''.join(f'<div class="q-card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="1.5">{path}</svg><span class="q-title">{t}</span></div><div class="q-desc">{d}</div></div>' for t,d,c,path in [
        ('引用核查','逐条比对被引文献原文，标记归属错误与虚构引用','#10b981','<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
        ('一致性审查','检测 Abstract-Results-Discussion 跨章节数据矛盾','#0ea5e9','<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'),
        ('Overclaim 检测','扫描全文，标记「首次」「证明」「最优」等过度措辞','#f59e0b','<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
        ('格式规范','校验 GB/T 7713 格式、三线表、引用标注、章节结构','#8b5cf6','<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'),
        ('数据溯源','确保每个数字和结论标注数据来源，避免无据可查','#06b6d4','<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'),
        ('结构完整性','检查 IMRAD 五步推进是否完整，引言缺口是否在结论中闭合','#f43f5e','<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    ])
    slides.append(f'''<div class="slide" id="s25"><div class="slide-inner" style="gap:40px">
<p class="t fade-in">6 维度<span class="em">质量保障</span></p>
<p class="p fade-in fade-d3">写完不是终点，审完才是</p>
<div class="q-grid fade-in fade-d6">{q_items}</div>
<p class="n fade-in fade-d12">AI 写 + AI 审 + AI 改 = 三道防线降低风险</p>
</div></div>''')

    # 27. Export
    slides.append('''<div class="slide" id="s26"><div class="slide-inner" style="gap:40px">
<p class="t fade-in">一键导出</p>
<div class="fade-in fade-d5" style="position:relative;display:inline-block"><div style="position:absolute;inset:0;background:#10b981;border-radius:50%;filter:blur(60px);opacity:.2;animation:pulse 2.5s infinite"></div><svg width="100" height="130" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="1" style="position:relative"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
<p class="n fade-in fade-d9">一份完整的、符合格式规范的、<br>自动插图的、引用真实的论文。<br>从我的系统里出来了。</p>
<p class="x fade-in fade-d15">当前：内测阶段 · 已有学长学姐使用</p>
</div></div>''')

    # 28. Real case
    slides.append(f'''<div class="slide" id="s27"><div class="slide-inner"><div class="split">
<div><div class="img-frame"><img src="{IMG['paper-title.png']}" alt="生成的论文" style="max-height:60vh"></div></div>
<div style="gap:24px;text-align:left">
<p class="t3" style="text-align:left">这是系统<br>生成的<span class="em">真实论文</span></p>
<div style="display:flex;flex-direction:column;gap:12px;font-size:.85rem;color:rgba(255,255,255,.4);font-weight:300">
<div style="display:flex;align-items:center;gap:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>12,917 字<span style="color:rgba(255,255,255,.15)"> — 完整研究型论文</span></div>
<div style="display:flex;align-items:center;gap:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>IMRAD 结构<span style="color:rgba(255,255,255,.15)"> — Abstract→Introduction→Methods→Results→Conclusion</span></div>
<div style="display:flex;align-items:center;gap:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>16 条引用<span style="color:rgba(255,255,255,.15)"> — 每条都来自知识库中真实论文</span></div>
<div style="display:flex;align-items:center;gap:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>5 温度 × 3 重复<span style="color:rgba(255,255,255,.15)"> — 完整统计分析与实验设计</span></div>
</div>
<p class="n" style="text-align:left">给学长学姐的初稿，他们说"结构完整"</p>
</div>
</div></div></div>''')

    # 29. Plagiarism
    slides.append(f'''<div class="slide" id="s28"><div class="slide-inner"><div class="split">
<div style="text-align:center;gap:24px">
<p class="huge" style="font-size:clamp(8rem,15vw,12rem)"><span class="em">11</span><span style="font-size:1.5rem;vertical-align:super">%</span></p>
<p class="p fade-in fade-d4">PaperPass 第三方查重</p>
<p class="n fade-in fade-d8">不是我自己说的。是机器判的。<br>11% 的相似度，远低于期刊投稿要求。</p>
<p class="fade-in fade-d12" style="font-size:.85rem;color:rgba(255,255,255,.2);font-weight:300;font-style:italic">AI 写 ≠ 抄袭。重点是你怎么用。</p>
</div>
<div class="fade-in fade-d5"><div class="img-frame"><img src="{IMG['plagiarism-report.png']}" alt="PaperPass 查重报告" style="max-height:55vh"></div></div>
</div></div></div>''')

    # 30. User feedback
    slides.append(f'''<div class="slide" id="s29"><div class="slide-inner"><div class="split">
<div><div class="img-frame"><img src="{IMG['chat-feedback.png']}" alt="学长反馈" style="max-height:55vh"></div></div>
<div style="gap:32px">
<p class="fade-in fade-d3 t3" style="line-height:1.3">"比我自己写的<span class="em">还要好</span>"</p>
<p class="fade-in fade-d6" style="font-size:1.5rem;font-weight:900;color:rgba(255,255,255,.7);line-height:1.3">"你这个东西做下去<span class="em">不得了啊</span>"</p>
<p class="n fade-in fade-d12">真实的学长反馈。不是测试账号。</p>
<p class="x fade-in fade-d18">系统已经在帮实验室的同学写初稿了</p>
</div>
</div></div></div>''')

    # 31. Multi-direction
    dirs = ''.join(f'<div class="col" style="gap:4px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.3)" stroke-width="1.5"><path d="M12 2L8 6l4 4-4 4 4 4-4 4"/></svg><p style="font-size:1.1rem;font-weight:700;color:#fff;margin-top:8px">{n}</p><p style="font-size:.75rem;color:rgba(255,255,255,.3)">{c}</p></div>' for n,c in [('控释肥','100 篇'),('茶学','178 篇'),('烟草','142 篇'),('热化学','167 篇'),('热解','139 篇'),('烟花','184 篇')])
    slides.append(f'''<div class="slide" id="s30"><div class="slide-inner" style="gap:48px">
<p class="t fade-in">不只是热解</p>
<p class="p fade-in fade-d3">每个研究方向，系统都能写</p>
<div class="row fade-in fade-d6" style="gap:32px">{dirs}</div>
</div></div>''')

    # 32. The crash
    slides.append('''<div class="slide" id="s31"><div class="slide-inner" style="gap:56px">
<p class="fade-in text-xs" style="color:rgba(255,255,255,.15);letter-spacing:.3em;text-transform:uppercase">第三周的某个晚上</p>
<div class="fade-in fade-d6" style="text-align:center"><p class="t">我想加一个新功能——<br><span class="em">自动插图</span></p><p class="p" style="margin-top:16px">改了一个地方。<br>整个 Results 章节的输出全乱了。</p></div>
<div class="fade-in fade-d14" style="text-align:center"><p style="font-size:1.5rem;color:rgba(255,255,255,.4);font-weight:300">我改了<span class="emr">四个小时</span>。<br>改不回原来的样子。</p></div>
<div class="fade-in fade-d22" style="text-align:center"><p class="t3">凌晨两点</p><p class="t3" style="color:#10b981">全部推倒。</p></div>
<p class="fade-in fade-d30" style="font-size:clamp(1rem,1.8vw,1.25rem);color:rgba(255,255,255,.45);font-weight:300;text-align:center;max-width:600px;line-height:1.6">推倒不是因为写错了。<br>是因为<span style="color:rgba(255,255,255,.8);font-weight:500">终于知道了什么是对的</span>。</p>
</div></div>''')

    # 33. Honest
    slides.append('''<div class="slide" id="s32"><div class="slide-inner" style="gap:48px">
<p class="t fade-in">这个系统</p>
<div class="row fade-in fade-d4" style="gap:48px">
<div class="col" style="gap:4px"><p class="line-through mb-1">不是商业产品</p><p style="font-size:1.2rem;font-weight:700;color:#f59e0b">是本科生 2 个月的原型</p></div>
<div class="col" style="gap:4px"><p class="line-through mb-1">不是一个 AI 聊天</p><p style="font-size:1.2rem;font-weight:700;color:#0ea5e9">是一套科研写作工作流</p></div>
<div class="col" style="gap:4px"><p class="line-through mb-1">不是完美的</p><p style="font-size:1.2rem;font-weight:700;color:#10b981">但我明天就能改</p></div>
</div>
<div class="fade-in fade-d20" style="text-align:center;margin-top:32px"><p class="t3" style="line-height:1.3">我就在<span class="em">实验室里</span></p><p class="p" style="margin-top:12px">需求到代码的距离，只有一张桌子</p></div>
</div></div>''')

    # 34. Why me
    slides.append('''<div class="slide" id="s33"><div class="slide-inner" style="gap:40px">
<p class="t fade-in">为什么是我能做出这个？</p>
<div class="row fade-in fade-d5" style="gap:80px">
<div class="col" style="gap:4px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><p class="card-title">AI 原生开发思维</p><p class="card-desc">半年用 AI 工具链完成 5 个项目</p></div>
<div class="col" style="gap:4px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><p class="card-title">一线调研能力</p><p class="card-desc">在真实世界发现痛点</p></div>
<div class="col" style="gap:4px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.4)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><p class="card-title">快速学习进化</p><p class="card-desc">从零到交付只用了 1 个月</p></div>
</div>
<p class="n fade-in fade-d15">这三件事，是同一件事：<br><span class="em">用工程思维解决真实问题</span></p>
</div></div>''')

    # 35. Thanks
    slides.append('''<div class="slide" id="s34"><div class="slide-inner" style="gap:48px">
<div style="position:relative;display:inline-block"><div style="position:absolute;inset:0;background:#10b981;border-radius:50%;filter:blur(80px);opacity:.2;animation:pulse 3s infinite"></div><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" style="position:relative"><path d="M12 2L8 6l4 4-4 4 4 4-4 4"/></svg></div>
<div class="fade-in fade-d4" style="text-align:center;color:rgba(255,255,255,.3);font-weight:300;font-size:clamp(.8rem,1.4vw,1rem);line-height:1.8">
<p>感谢<span style="color:rgba(255,255,255,.6)">周院长</span>的支持和信任</p>
<p style="font-size:.8rem;color:rgba(255,255,255,.2)">这个想法最初是他提出来的——没有他就没有这个系统</p>
<div style="width:40px;height:1px;background:rgba(255,255,255,.1);margin:12px auto"></div>
<p style="font-size:.8rem;color:rgba(255,255,255,.25)">感谢实验室四个方向的老师和同学</p>
<p style="font-size:.8rem;color:rgba(255,255,255,.2)">感谢台下每一位老师的聆听</p>
</div>
<p class="fade-in fade-d10" style="font-size:clamp(1rem,2vw,1.5rem);font-weight:700;color:rgba(255,255,255,.6);text-align:center;max-width:800px;line-height:1.6">一个大二学生，用半年时间，从零到一，<br>独立交付了一个完整的工程系统。</p>
<p class="fade-in fade-d18" style="font-size:clamp(3rem,6vw,5rem);font-weight:900;color:#fff">这只是开始<span class="em">。</span></p>
<p style="font-size:10px;color:rgba(255,255,255,.06);letter-spacing:.3em;text-transform:uppercase;margin-top:32px">黄奕轩 · 2026.06 · GrainScript</p>
</div></div>''')

    return '\n'.join(slides)

# ============================================================
if __name__ == '__main__':
    slides_html = build_slides()
    outpath = 'D:/project/论文助手/禾书耕文-演示.html'
    write(slides_html, outpath)
    print(f'Done! {len(slides_html)} chars of slides')
