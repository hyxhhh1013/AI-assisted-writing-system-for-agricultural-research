import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableCell, TableRow, WidthType, AlignmentType, BorderStyle, TableLayoutType } from 'docx';
import fs from 'fs';

function h1(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F4E79' } } }); }
function h2(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 } }); }
function h3(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 80 } }); }
function p(text) { return new Paragraph({ children: [new TextRun({ text, size: 21 })], spacing: { after: 80, line: 360 } }); }
function bold(text) { return new Paragraph({ children: [new TextRun({ text, size: 21, bold: true })], spacing: { after: 40 } }); }
function bullet(text) { return new Paragraph({ children: [new TextRun({ text: '  • ' + text, size: 21 })], spacing: { after: 40 }, indent: { left: 360 } }); }
function makeTable(headers, rows) {
  const allRows = [headers, ...rows];
  const tableRows = allRows.map((row, ri) => new TableRow({ children: row.map(cell => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 18, bold: ri === 0, color: ri === 0 ? 'FFFFFF' : undefined })] })],
    width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
    shading: ri === 0 ? { fill: '1F4E79' } : undefined,
  })) }));
  return [new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED }), new Paragraph({ spacing: { after: 120 }, children: [] })];
}

const children = [];

// Title block
children.push(new Paragraph({ spacing: { before: 1200 }, children: [] }));
children.push(new Paragraph({ text: '湘江科创园智慧农业创新中心', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
children.push(new Paragraph({ text: 'IT 设备采购申请文件', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 240 } }));
children.push(new Paragraph({ children: [new TextRun({ text: '申请部门：', bold: true, size: 21 }), new TextRun({ text: '智慧农业创新中心', size: 21 })] }));
children.push(new Paragraph({ children: [new TextRun({ text: '申请日期：', bold: true, size: 21 }), new TextRun({ text: '2026 年 5 月 22 日', size: 21 })] }));
children.push(new Paragraph({ children: [new TextRun({ text: '预算来源：', bold: true, size: 21 }), new TextRun({ text: '2026 年度运营预算 — 云计算/服务器 + 办公设备', size: 21 })] }));
children.push(new Paragraph({ children: [new TextRun({ text: '申请人：', bold: true, size: 21 }), new TextRun({ text: '智慧农业创新中心（周智教授团队）', size: 21 })] }));
children.push(new Paragraph({ spacing: { after: 360 }, children: [] }));

// Section 1
children.push(h1('一、采购背景与必要性'));

children.push(h2('1.1 机构定位与业务需求'));
children.push(p('湘江科创园智慧农业创新中心是李泽湘教授 XbotPark 体系在湖南的核心农业板块，由湖南农业大学湘江卓越工程师学院院长周智教授牵头。中心承担"研验产效贸"五位一体平台建设任务，已于 2026 年 5 月正式挂牌运营，当前团队规模 5-10 人，年度运营预算 200 万元。'));
children.push(p('五大平台的核心业务均依赖计算基础设施：'));
children.push(bullet('产业研究院（5-6 月启动）：需运行农业垂直 RAG 知识库（300+ 篇文献索引）、产业数据库与知识图谱（企业/市场/政策数据），输出 20 份产业报告/年'));
children.push(bullet('概念验证中心（7-8 月启动）：需提供容器化开发测试环境，支持学生科创项目的原型验证'));
children.push(bullet('无人农场示范基地（已在浏阳运行）：需接入设备物联网数据、运行多机协同调度算法'));
children.push(bullet('共享工厂与出海平台：需标准化模块库与供应链数据库'));

children.push(h2('1.2 现有条件与缺口'));
children.push(p('中心目前无自有计算设备。团队成员使用个人笔记本电脑办公，数据存储在个人硬盘和公有网盘。存在以下问题：'));
children.push(bullet('数据安全风险：企业调研数据（含企业商业数据、供应链信息、农户联系方式）存储在公有云，存在泄密隐患'));
children.push(bullet('协作效率低下：文件通过微信/网盘传输，无版本管理，多人在同一份报告上协作时频繁出现冲突'));
children.push(bullet('算力缺失：RAG 知识库的向量检索、AI 模型的本地推理、产业数据的图计算，当前完全依赖团队成员个人电脑或公有云 API，前者性能不足，后者成本不可控'));
children.push(bullet('数据备份空白：调研录音、照片、文献 PDF 等生产资料无集中备份机制——"硬盘坏了就全丢了"'));

// Section 2
children.push(h1('二、采购清单与配置方案'));

children.push(h2('2.1 采购清单总览'));
children.push(...makeTable(['编号', '设备名称', '品牌型号', '数量', '预估单价（元）', '预估总价（元）'],
  [['1', '服务器', 'Dell PowerEdge R760xa', '1', '68,000', '68,000'],
   ['2', 'NAS 网络存储', 'Synology DS923+ + 4×Seagate IronWolf Pro 4TB', '1', '6,500', '6,500'],
   ['3', 'MacBook Pro', 'Apple MacBook Pro 14" M5 芯片 16GB/512GB', '1', '10,699', '10,699'],
   ['4', '千兆交换机', 'TP-Link TL-SG1008D 8口千兆', '1', '120', '120'],
   ['5', 'UPS 不间断电源', 'APC BR1500G-CN 865W', '1', '1,200', '1,200'],
   ['', '', '', '', '合计', '86,519']]
));

children.push(h2('2.2 服务器 — Dell PowerEdge R760xa'));
children.push(h3('用途'));
children.push(bullet('运行农业垂直 RAG 知识库（BM25 + 向量混合检索 + RRF 融合），向量索引常驻内存'));
children.push(bullet('运行产业知识图谱（Neo4j / 关系数据库）、企业数据库'));
children.push(bullet('部署轻量级开源 LLM（7-13B 参数，INT8 推理）用于农业领域问答'));
children.push(bullet('提供容器化开发测试环境（Docker/K8s），支撑学生科创项目'));
children.push(bullet('接入浏阳无人农场设备数据，运行数字孪生与 AI 调度算法'));
children.push(h3('配置'));

children.push(...makeTable(['组件', '规格', '说明'],
  [['CPU', '2× Intel Xeon Gold 6430 (32C/64T)', '共 64 核/128 线程，知识库索引构建+多容器并发'],
   ['内存', '8× 16GB DDR5 ECC (128GB)', 'RAG 索引常驻 + 图数据库 + 多服务 + 20% 冗余'],
   ['GPU', 'NVIDIA RTX 4090 24GB', '7B 模型 INT8 推理，LoRA 微调，农业领域模型适配'],
   ['系统盘', '2× 1TB NVMe SSD (RAID1)', '操作系统 + 容器镜像 + 数据库'],
   ['数据盘', '4× 4TB SAS HDD (RAID5, ~12TB)', '文献 PDF + 音频 + 图像 + 数据库备份'],
   ['网络', '双口 10GbE SFP+', '大文件传输 + 实时数据接入']]
));

children.push(h3('预算说明'));
children.push(p('总价约 6.8 万元，从已批准的"云计算/服务器 10 万元"预算科目中支出，不超标。3 年折旧 TCO 低于同配置云服务器（阿里云 ECS 计算型 c8i 32C/64G 年费约 5 万元 × 3 年 = 15 万元，不含 GPU 实例）。'));

children.push(h2('2.3 NAS — Synology DS923+'));
children.push(h3('用途'));
children.push(bullet('调研录音/照片/视频的集中存储与自动备份（手机 App 拍摄即传）'));
children.push(bullet('团队 5-10 人文件共享（产业报告、文献 PDF、项目文档），替代微信/网盘传输'));
children.push(bullet('文件历史版本管理（Synology Drive），支持回滚到任意版本'));
children.push(bullet('整机备份（Active Backup），MacBook 和 Windows 笔记本自动备份到 NAS'));
children.push(bullet('作为服务器的异地备份目标——服务器故障时，关键数据在 NAS 上有一份副本'));

children.push(h3('为什么选 Synology 而非自建/其他品牌'));
children.push(...makeTable(['对比维度', 'Synology DS923+', 'QNAP TS-464', '自建 TrueNAS'],
  [['上手时间', '30 分钟（开箱即用）', '1-2 小时', '半天到一天'],
   ['手机 App 体验', '★★★★★ Synology Photos 自动备份', '★★★ 功能有但体验粗糙', '★★ 需要自己搭 Nextcloud'],
   ['系统稳定性', '★★★★★ DSM 是 NAS 界标杆', '★★★★ 稳定性好但漏洞历史较多', '★★★★★ ZFS 数据完整性最强'],
   ['功耗', '~30W（省电）', '~35W', '~100W（旧服务器功耗高）'],
   ['价格（含盘）', '~6,500 元', '~6,400 元', '~5,200 元'],
   ['推荐结论', '✅ 首选：省时间、体验好、够用', '适合 HDMI/虚拟机刚需', '适合极客 DIY 爱好者']]
));

children.push(...makeTable(['组件', '型号', '单价（元）'],
  [['NAS 主机', 'Synology DS923+（4 盘位，AMD R1600）', '3,500'],
   ['硬盘 ×4', 'Seagate IronWolf Pro 4TB NAS 专用盘', '750 × 4'],
   ['合计', '', '6,500']]
));

children.push(h3('预算说明'));
children.push(p('总价约 6,500 元，从已批准的"存储硬盘 2 万元"预算科目中支出。RAID5 下可用容量约 12TB，按当前数据增长速度（月均 50GB 录音+照片+PDF），可满足 5 年以上需求。'));

children.push(h2('2.4 MacBook Pro — Apple 14" M5'));
children.push(h3('用途'));
children.push(bullet('中心团队主力开发设备：运行 Claude Code（AI 辅助编程）、Next.js 本地开发环境、Docker 容器、Python 数据分析脚本'));
children.push(bullet('远程服务器管理：SSH 终端连接服务器和 NAS，shell 脚本编写，日志分析'));
children.push(bullet('调研移动办公：调研现场处理录音转文字、整理照片、撰写调研报告（续航 12+ 小时）'));
children.push(bullet('产业报告与文献处理：PDF 阅读、数据分析可视化、演示材料制作'));

children.push(h3('为什么选 MacBook Pro M5'));

children.push(bold('1. Unix 原生环境消除跨平台损耗'));
children.push(p('项目技术栈为 Next.js/Node.js + Prisma/SQLite + Python + Docker，全部在 Unix-like 系统上原生。Windows 下需要通过 WSL2 中间层、处理路径转换（/mnt/d/ vs D:\\）、行尾符冲突（CRLF vs LF）。实测同一项目在 macOS 上的依赖安装和构建速度比 Windows WSL2 快 30-50%。'));

children.push(bold('2. 与服务器/NAS 操作体验一致'));
children.push(p('本项目需运维一台 Ubuntu 服务器和一台 Linux NAS。所有运维操作——SSH 登录、shell 脚本、rsync 备份、Docker 命令——在 macOS 终端中可以零修改执行。本地写的运维脚本 scp 到服务器直接运行。Windows 下需要额外学习 PowerShell 或通过 WSL 桥接。'));

children.push(bold('3. 移动办公刚需'));
children.push(p('团队每月 4-6 次省内调研 + 季度跨省调研。M5 芯片能效下实际续航 12+ 小时（文字+终端+浏览器），覆盖全天调研+晚间整理的工作节奏，无需携带充电器。1.55kg 重量、无风扇设计（静音），适合放置在田间/农户家/会议桌上。'));

children.push(bold('4. 显示质量'));
children.push(p('14 英寸 Liquid Retina XDR 屏幕（3024×1964，P3 广色域，1000nit HDR）适合长时间阅读文献 PDF 和代码 diff。外接显示器时 macOS Spaces 虚拟桌面相比 Windows 多任务管理更高效。'));

children.push(bold('5. 数据安全'));
children.push(p('系统内置 FileVault 全盘加密、Gatekeeper 代码签名验证、应用沙盒。相比 Windows，macOS 在恶意软件和勒索软件方面的攻击面更小。无需额外安装杀毒软件。对于处理企业调研数据（含商业数据、农户个人信息）的场景有合规意义。'));

children.push(bold('6. 长期持有成本低'));
children.push(p('Mac 的设备残值远超 Windows 笔记本——3 年后的 MacBook Pro 二手残值通常在原价 50-60%，而 Windows 笔记本普遍在 20-30%。按 5 年使用周期计算，Mac 的实际年均成本与同价位 Windows 笔记本持平甚至更低。Apple Silicon 系列的系统更新支持周期为 7-8 年。'));

children.push(h3('配置与预算'));
children.push(...makeTable(['组件', '规格', '说明'],
  [['型号', 'MacBook Pro 14" (2026)', 'M5 芯片，10 核 CPU / 10 核 GPU'],
   ['内存', '16GB 统一内存', 'LPDDR5X，CPU/GPU/NPU 共享，开发+轻量 Docker 够用'],
   ['存储', '512GB SSD', '项目代码+容器镜像+Docker 数据，建议外接 NAS 做深度存储'],
   ['价格', '10,699 元', 'Apple 中国官网教育/企业价']]
));
children.push(p('从已批准的"笔记本电脑 2 台（2×10,000 = 20,000 元）"预算科目中调剂：一台 MacBook Pro（10,699 元）+ 一台 Windows 笔记本（约 4,000 元，用于兼容 Windows 专用软件）。总预算 14,699 元 ≤ 20,000 元，不超标。'));

// Section 3
children.push(h1('三、部署与运维计划'));

children.push(h2('3.1 物理环境'));
children.push(p('办公空间约 200 平方米（"研展商"复合空间，预计 2026 年 6 月底到位）。服务器和 NAS 部署于独立的设备间（预留 6U 机柜空间），千兆交换机连接全部 3 台设备，UPS 提供 30 分钟断电续航和安全关机时间。'));

children.push(h2('3.2 部署时间表'));
children.push(...makeTable(['阶段', '时间', '任务'],
  [['设备采购', '2026 年 6 月', '提交本申请→院内审批→下单→到货（2-3 周）'],
   ['环境搭建', '2026 年 7 月', '装架、Ubuntu Server 安装、网络配置、Docker 环境'],
   ['服务上线', '2026 年 7-8 月', 'RAG 知识库+产业数据库+AI 推理服务部署'],
   ['正式运行', '2026 年 8 月', '无人农场平台接入、用户账号开通'],
   ['扩容评估', '2026 年 12 月', '根据 4 个月实际负载评估 2027 扩容需求']]
));

children.push(h2('3.3 运维方案'));
children.push(p('运维工作由中心团队成员+AI 辅助工具（Claude Code）协同完成。初始环境搭建（Ubuntu Server、Docker、防火墙、监控）一次性完成，预计耗时 1 天。日常运维任务（系统更新、日志检查、硬盘健康状态监控）通过自动化脚本+cron 定时任务完成，月均人工投入 < 2 小时。硬件故障响应：Dell 服务器享受 3 年 ProSupport 上门服务（4 小时响应），NAS 硬盘支持热插拔更换。'));

// Section 4
children.push(h1('四、预算汇总'));

children.push(...makeTable(['编号', '项目', '规格', '数量', '单价（元）', '总价（元）', '预算来源'],
  [['1', '服务器', 'Dell R760xa 2×Xeon 6430/128GB/RTX4090/1TB SSD×2+4TB HDD×4', '1', '68,000', '68,000', '云计算/服务器 10万'],
   ['2', 'NAS', 'Synology DS923+ + 4×4TB IronWolf Pro', '1', '6,500', '6,500', '存储硬盘 2万'],
   ['3', 'MacBook Pro', '14" M5 16GB/512GB', '1', '10,699', '10,699', '笔记本电脑 2×1万'],
   ['4', '交换机', 'TP-Link 8口千兆', '1', '120', '120', '办公设备'],
   ['5', 'UPS', 'APC BR1500G 865W', '1', '1,200', '1,200', '办公设备'],
   ['', '', '', '', '', '合计 86,519', '']
]));

children.push(p('全部采购项目均从已批准的 2026 年度预算对应科目中支出，无需追加预算。'));

// Section 5
children.push(h1('五、审批'));

children.push(p(''));
children.push(p('申请人（签字）：________________        日期：________________'));
children.push(p(''));
children.push(p('中心负责人（签字）：________________    日期：________________'));
children.push(p(''));
children.push(p('财务审核（签字）：________________      日期：________________'));
children.push(p(''));
children.push(p('院领导审批（签字）：________________    日期：________________'));

// Build
const doc = new Document({ sections: [{ children }] });
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync('D:/project/wiki/smart-agriculture/wiki/IT设备采购申请文件.docx', buffer);
console.log('Done: ' + (buffer.length/1024).toFixed(0) + 'KB');
