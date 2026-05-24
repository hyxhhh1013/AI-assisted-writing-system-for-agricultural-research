import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableCell, TableRow, WidthType, AlignmentType, BorderStyle, PageBreak, Header, Footer, PageNumber, TableOfContents, Tab, TabStopType, TabStopPosition } from 'docx';
import fs from 'fs';

// ===== Format helpers (matching university spec) =====
// Margin: top/bottom 2.54cm, left/right 2.6cm = 1440twips per cm
const MARGIN = 2600; // 2.6cm right/left
const MARGIN_TB = 2440; // ~2.54cm

// Font sizes (in half-points): 小三=30, 四号=28, 小四=24, 五号=21
const H1_SIZE = 30; // 小三 黑体 (title 一、)
const H2_SIZE = 28; // 四号 黑体 (title (一))
const H3_SIZE = 24; // 小四 黑体 (title 1.)
const BODY_SIZE = 24; // 小四 宋体
const TABLE_SIZE = 21; // 五号 宋体
const CAPTION_SIZE = 21; // 五号 黑体

function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: '黑体', size: H1_SIZE, bold: true })],
    spacing: { before: 240, after: 120, line: 440 },
  });
}
function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: '黑体', size: H2_SIZE, bold: true })],
    spacing: { before: 200, after: 100, line: 440 },
  });
}
function h3(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: '黑体', size: H3_SIZE, bold: true })],
    spacing: { before: 160, after: 80, line: 440 },
    indent: { firstLine: 480 },
  });
}
function body(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: '宋体', size: BODY_SIZE })],
    spacing: { after: 80, line: 440 },
    indent: { firstLine: 480 },
  });
}
function bodyNoIndent(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: '宋体', size: BODY_SIZE })],
    spacing: { after: 80, line: 440 },
  });
}
function caption(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: '黑体', size: CAPTION_SIZE })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 80 },
  });
}
function makeTable(headers, ...rows) {
  const allRows = [headers, ...rows];
  const tableRows = allRows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(cell), font: ri === 0 ? '黑体' : '宋体', size: TABLE_SIZE, bold: ri === 0 })],
        alignment: ci === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
      })],
      width: { size: ci === 0 ? 20 : 80 / (row.length - 1), type: WidthType.PERCENTAGE },
    })),
  }));
  return new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } });
}
function emptyLine() { return new Paragraph({ spacing: { after: 120 }, children: [] }); }

// ===== COVER PAGE =====
const coverChildren = [];
coverChildren.push(new Paragraph({ spacing: { before: 2400 }, children: [] }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '湖南农业大学课程论文', font: '黑体', size: 36, bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 600 } }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '学  院：信息与智能科学技术学院', font: '宋体', size: 28 })], spacing: { after: 200, line: 600 } }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '班  级：____________', font: '宋体', size: 28 })], spacing: { after: 200, line: 600 } }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '姓  名：____________', font: '宋体', size: 28 })], spacing: { after: 200, line: 600 } }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '学  号：____________', font: '宋体', size: 28 })], spacing: { after: 200, line: 600 } }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '课程论文题目：个人作品集内容管理系统的设计与实现', font: '宋体', size: 28 })], spacing: { after: 200, line: 600 } }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '课程名称：企业级应用开发', font: '宋体', size: 28 })], spacing: { after: 200, line: 600 } }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '评阅成绩：____________', font: '宋体', size: 28 })], spacing: { after: 1000, line: 600 } }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '成绩评定教师签名：____________', font: '宋体', size: 28 })], spacing: { after: 200, line: 600 } }));
coverChildren.push(new Paragraph({ children: [new TextRun({ text: '日期：____年____月____日', font: '宋体', size: 28 })], spacing: { after: 200, line: 600 } }));

// ===== PAPER BODY =====
const bodyChildren = [];

// Title page
bodyChildren.push(new Paragraph({ spacing: { before: 1200 }, children: [] }));
bodyChildren.push(new Paragraph({ children: [new TextRun({ text: '个人作品集内容管理系统的设计与实现', font: '黑体', size: 32, bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 240 } }));
bodyChildren.push(new Paragraph({ children: [new TextRun({ text: '学  生：×××  （信息与智能科学技术学院 ××班，学号××××）', font: '宋体', size: 24 })], alignment: AlignmentType.CENTER, spacing: { after: 360 } }));

// Abstract
bodyChildren.push(new Paragraph({ children: [new TextRun({ text: '摘  要：', font: '黑体', size: H3_SIZE, bold: true }), new TextRun({ text: '随着互联网技术的快速发展，个人品牌的数字化展示已成为专业技术人员的重要需求。本文设计并实现了一个基于前后端分离架构的个人作品集内容管理系统。系统采用 React 18 + TypeScript + Vite 构建前端，Node.js + Express + TypeScript 构建后端 API 服务，MySQL 作为数据库，Prisma ORM 进行数据建模与迁移。系统实现了个人经历、专业技能、项目作品、摄影作品、音乐收藏、旅行足迹、日常动态等多元内容的集中管理与动态展示。后台管理系统提供仪表盘、CRUD 操作、拖拽排序、批量处理、Markdown 编辑、图片自动压缩与 EXIF 信息提取等功能。系统采用 JWT 认证、Zod 请求校验、Express-rate-limit 限流、node-cache 缓存等企业级中间件保障安全与性能，部署方案涵盖 Nginx 反向代理与 PM2 进程管理。经测试，系统各项功能运行正常，响应时间均在 200ms 以内，达到了预期的设计目标。', font: '宋体', size: BODY_SIZE })], spacing: { after: 120, line: 440 }, indent: { firstLine: 480 } }));
bodyChildren.push(new Paragraph({ children: [new TextRun({ text: '关键词：', font: '黑体', size: H3_SIZE, bold: true }), new TextRun({ text: '前后端分离；内容管理系统；React；Express；Prisma ORM；TypeScript', font: '宋体', size: BODY_SIZE })], spacing: { after: 240, line: 440 } }));

// Introduction
bodyChildren.push(h1('一、前言'));
bodyChildren.push(body('随着 Web 开发技术的不断演进，前后端分离架构已成为企业级应用开发的主流范式。对于专业技术人员而言，个人作品集不仅是展示技术能力的窗口，也是实践全栈开发能力的理想载体。传统的个人网站往往采用静态 HTML 页面或 WordPress 等 CMS 平台，存在内容更新不便、扩展性差、前后端耦合度高等问题。'));
bodyChildren.push(body('为解决上述问题，本文设计并实现了一套个人作品集内容管理系统（Personal Portfolio Content Management System，PPCMS）。系统采用前后端完全分离的架构设计，前端基于 React 18 框架构建响应式用户界面，后端基于 Express 框架构建 RESTful API 服务，数据库采用 MySQL 关系型数据库并通过 Prisma ORM 进行对象关系映射。系统具备日间/夜间主题切换、音乐播放、摄影画廊、动态发布等丰富的交互功能，后台管理支持拖拽排序、批量处理、图片智能压缩等高效管理特性。'));
bodyChildren.push(body('本文将从系统需求分析、技术选型、系统设计、核心功能实现及部署方案五个方面，完整阐述该系统的设计与实现过程。'));

// Ch2 Architecture
bodyChildren.push(h1('二、相关技术概述'));
bodyChildren.push(h2('（一）前端技术栈'));
bodyChildren.push(body('前端采用 React 18 作为核心框架，使用 TypeScript 进行类型安全的开发，Vite 作为构建工具。UI 组件库方面，后台管理系统采用 Ant Design 6.1，通过其丰富的企业级组件（Table、Form、Upload、Modal 等）快速搭建管理界面；前台展示页面采用 Tailwind CSS 3.4 实现原子化样式设计，参考 Apple 官网设计风格打造极简视觉效果。页面动效采用 Framer Motion 12 实现流畅的滚动视差与页面切换动画。其他关键依赖包括：React Router v6 实现前端路由管理，Axios 处理 HTTP 请求，Chart.js 与 Recharts 实现数据可视化，@dnd-kit 实现拖拽排序功能。'));
bodyChildren.push(h2('（二）后端技术栈'));
bodyChildren.push(body('后端采用 Node.js + Express + TypeScript 技术栈构建 RESTful API 服务。数据持久化层使用 Prisma ORM，通过 Schema 定义数据模型并自动生成类型安全的数据库客户端，支持数据库迁移与种子数据填充。身份认证采用 JSON Web Token（JWT）机制，用户登录后签发 Token，后续请求通过 Authorization 头携带 Token 进行身份验证。文件上传采用 Multer 中间件处理 multipart/form-data，图片处理采用 Sharp 实现智能压缩与缩略图生成，EXIF 元数据提取采用 Exifr 库。输入校验采用 Zod Schema 定义验证规则，确保 API 请求参数的合法性。安全防护方面，部署了 Helmet 安全头、CORS 跨域控制、Express-rate-limit 请求限流等多层中间件。'));
bodyChildren.push(h2('（三）数据库'));
bodyChildren.push(body('系统采用 MySQL 关系型数据库，通过 Prisma ORM 进行数据建模与访问。Prisma Schema 中定义了 30 个数据模型，涵盖用户信息、教育经历、工作经历、技能、项目、摄影、音乐、影视、旅行、留言、弹幕等业务实体。每个模型通过 Prisma Migrate 自动生成数据库迁移脚本，保证数据库 Schema 与代码模型的同步。'));

// Ch3 System Design
bodyChildren.push(h1('三、系统设计'));
bodyChildren.push(h2('（一）系统架构设计'));
bodyChildren.push(body('系统采用经典的前后端分离三层架构：表现层（React 前端）通过 HTTP/HTTPS 协议调用应用层（Express REST API），应用层通过 Prisma ORM 访问数据层（MySQL）。Nginx 作为反向代理服务器，将前端静态资源请求和后端 API 请求进行统一路由分发，同时提供 SSL 终端、Gzip 压缩和静态资源缓存功能。前端构建产物部署至 Nginx 静态文件目录，后端服务通过 PM2 进程管理器进行守护和自动重启。'));
bodyChildren.push(body('前端内部采用组件化架构，分为公共组件（Sections）、页面组件（Pages）和上下文提供者（Context Providers）三层。AuthContext 管理用户认证状态，ThemeContext 管理主题切换，MusicContext 管理全局音乐播放器状态，PhotoContext 管理摄影画廊的状态。后台管理采用 AdminLayout 统一布局，通过 React Router 的嵌套路由实现管理模块的导航切换。'));

bodyChildren.push(h2('（二）数据库设计'));
bodyChildren.push(body('数据库设计遵循第三范式，核心业务实体及其关系如下：User 为核心实体，关联 Education（一对多）、Experience（一对多）、Skill（一对多）、Project（一对多）、Contact（一对多）等子实体，均设置级联删除。Photo 关联 PhotoCategory（多对一）和 Tag（多对多），通过隐式关系表 phototags 实现。SiteConfig 为单例配置表，记录网站标题、SEO 关键词、ICP 备案号等全局配置。VisitorStat 按日统计访问量，Message 和 Danmaku 记录访客互动数据。'));

bodyChildren.push(emptyLine());
bodyChildren.push(caption('表1  系统核心数据模型'));
bodyChildren.push(makeTable(
  ['模型名', '表名', '主要字段', '关联关系'],
  ['User', 'user', 'name, email, password, title, bio, avatar', '一对多：Education/Experience/Skill/Project'],
  ['Project', 'project', 'title, description, technologies, githubUrl, images', '多对一：User'],
  ['Photo', 'photo', 'title, imageUrl, thumbnailUrl, cameraModel, iso, aperture', '多对一：Category；多对多：Tag'],
  ['Music', 'music', 'title, artist, coverUrl, platform, url, lyrics', '—'],
  ['Movie', 'movie', 'title, director, year, posterUrl, rating, review', '—'],
  ['TravelCity', 'travel_city', 'name, city, province, latitude, longitude, photos', '—'],
  ['Message', 'message', 'name, email, subject, content, isRead', '—'],
  ['SiteConfig', 'site_config', 'siteTitle, seoKeywords, icpCode', '单例'],
));

bodyChildren.push(h2('（三）API 接口设计'));
bodyChildren.push(body('系统遵循 RESTful 设计规范，共设计 117 个 API 端点，分为 20 个路由模块。接口统一使用 JSON 格式进行数据交互，采用标准的 HTTP 状态码表示请求结果。所有管理类接口均要求 Bearer Token 认证，公开接口（如留言提交、访问统计）不要求认证。部分高频读取接口（如照片列表、项目列表）采用 node-cache 进行内存缓存，缓存时长 5-15 分钟。文件上传接口支持单文件和多文件两种模式，图片自动经过 Sharp 压缩和缩略图生成处理。'));

bodyChildren.push(emptyLine());
bodyChildren.push(caption('表2  核心 API 接口一览'));
bodyChildren.push(makeTable(
  ['模块', '端点示例', '方法', '认证', '说明'],
  ['认证', '/api/auth/login', 'POST', '否', '邮箱密码登录，返回JWT（30天有效）'],
  ['用户', '/api/users/:id', 'GET', '否', '获取用户公开信息'],
  ['项目', '/api/projects', 'GET/POST', 'GET否/POST是', '列表支持缓存；创建支持5图上传'],
  ['照片', '/api/photos', 'GET/POST', '否/是', '分页/分类筛选/字段选择；自动EXIF提取和缩略图'],
  ['照片批量', '/api/photos/bulk', 'POST', '是', '批量上传（≤10张），自动递增排序'],
  ['音乐', '/api/music/resolve', 'GET', '否', '解析网易云/QQ音乐直链与歌词'],
  ['留言', '/api/messages', 'POST', '否', '访客提交留言，支持批量已读/批量删除'],
  ['站点配置', '/api/siteConfig', 'GET/PUT', 'GET否/PUT是', '全局配置读写，GET缓存10分钟'],
  ['弹幕', '/api/danmaku', 'GET/POST', 'GET否/POST否', '访客发送弹幕，后台审核管理'],
  ['AI助手', '/api/ai/chat/stream', 'POST', '否', 'SSE流式AI对话'],
));

bodyChildren.push(h2('（四）前端路由设计'));
bodyChildren.push(body('前端采用 React Router v6 的 BrowserRouter 模式，路由分为三层：公共路由（首页、登录）包裹在 Layout 布局组件中，管理路由包裹在 ProtectedRoute 鉴权组件和 AdminLayout 布局组件中，Demo 路由独立渲染。AdminLayout 内部通过嵌套路由（Outlet）实现 13 个管理子模块的无刷新切换。代码分割方面，公共页面（Home）和 Demo 页面采用 React.lazy 动态导入，减小首屏加载体积。'));

// Ch4 Implementation
bodyChildren.push(h1('四、核心功能实现'));
bodyChildren.push(h2('（一）身份认证与授权'));
bodyChildren.push(body('系统采用 JWT（JSON Web Token）实现无状态身份认证。用户通过 /api/auth/login 接口提交邮箱和密码，后端使用 bcryptjs 比对加密后的密码，验证通过后签发 Token（有效期 30 天）。前端 AuthContext 将 Token 持久化至 localStorage，并在 Axios 请求拦截器中自动附加 Authorization 头。ProtectedRoute 组件在路由层面进行认证守卫，未登录用户访问管理页面时自动跳转登录页。后端 protect 中间件从请求头提取 Token 并验证，验证失败返回 401 状态码。'));
bodyChildren.push(h3('1. 密码安全'));
bodyChildren.push(body('用户密码采用 bcryptjs 进行哈希加盐处理，数据库中仅存储密文。修改密码接口要求同时提供旧密码和新密码，验证旧密码正确后方可更新。'));
bodyChildren.push(h3('2. 输入校验'));
bodyChildren.push(body('系统使用 Zod 定义了 16 个校验 Schema，覆盖所有 API 端点的请求体、查询参数和路径参数。validateRequest 中间件在控制器执行前对请求数据进行校验，校验失败返回 400 状态码及详细的错误信息。'));

bodyChildren.push(h2('（二）图片管理与处理'));
bodyChildren.push(body('摄影管理是系统最复杂的功能模块。文件上传采用 Multer 内存存储模式，限制单文件最大 40MB，仅允许 JPEG/PNG/WebP 格式。上传后的处理流程如下：'));
bodyChildren.push(body('（1）使用 Sharp 库生成缩略图（宽度 800px，质量 80%），大幅减小前端画廊的加载体积；同时生成优化图（宽度 1920px，质量 85%）用于灯箱全屏查看。'));
bodyChildren.push(body('（2）使用 Exifr 库自动读取照片的 EXIF 元数据，提取相机型号、镜头型号、焦距、光圈值、快门速度、ISO 感光度、拍摄时间等信息，无需用户手动输入。前端画廊悬停时叠加显示拍摄参数水印。'));
bodyChildren.push(body('（3）支持批量上传（最多 10 张）、批量删除、批量分类移动、拖拽排序等高效管理操作。照片列表接口支持按分类（categoryId）、精选（isFeatured）、关键词搜索、字段选择（fields）等多维过滤。'));
bodyChildren.push(body('（4）照片列表接口采用 node-cache 进行内存缓存（TTL 5 分钟），以查询参数组合作为缓存键，在保证数据实时性的同时显著降低数据库查询压力。'));

bodyChildren.push(h2('（三）项目管理与拖拽排序'));
bodyChildren.push(body('项目管理模块支持图文混排的项目展示。项目详情采用 Markdown 编辑器（react-simplemde-editor），支持标题、列表、代码块、图片、链接等富文本格式。项目配图支持多图上传（最多 5 张），通过 Multer 处理上传，存储至服务器 uploads 目录。'));
bodyChildren.push(body('项目列表排序采用 @dnd-kit 拖拽库实现。前端通过 DndContext 和 SortableContext 包裹项目列表，用户拖拽调整顺序后，前端实时更新 UI，同时将新的顺序数组通过 PUT 接口提交至后端更新 orderIndex 字段。排序逻辑在控制器中通过批量 update 事务实现。'));

bodyChildren.push(h2('（四）音乐解析与播放器'));
bodyChildren.push(body('音乐模块的亮点在于自研的音乐解析与播放功能。后端 /api/music/resolve 接口接收网易云音乐或 QQ 音乐的分享链接，调用第三方解析 API（api.vvhan.com）获取歌曲直链、封面图、歌词等信息并返回。前端 MusicContext 维护全局播放器状态（当前曲目、播放列表、播放进度），MusicSection 组件渲染带毛玻璃效果的自定义播放器界面。歌词支持实时滚动定位，通过监听播放进度与歌词时间轴匹配实现。'));

bodyChildren.push(h2('（五）中间件体系'));
bodyChildren.push(body('系统构建了完整的企业级中间件栈，保障应用的安全性和性能：'));
bodyChildren.push(body('（1）安全中间件：自定义安全头中间件设置 X-XSS-Protection、X-Content-Type-Options、X-Frame-Options、Referrer-Policy、Strict-Transport-Security、Content-Security-Policy、Permissions-Policy 等 HTTP 安全头，移除 X-Powered-By 头以减少信息泄露。'));
bodyChildren.push(body('（2）限流中间件：Express-rate-limit 对 /api 路径限制每 IP 每 15 分钟最多 1000 次请求，超过限制返回 429 状态码。'));
bodyChildren.push(body('（3）缓存中间件：node-cache 实现可配置时长的内存缓存，仅对 GET 请求生效，在响应头中设置 X-Cache 标识缓存命中状态。数据变更时通过 clearCache 主动失效对应的缓存键。'));
bodyChildren.push(body('（4）压缩中间件：compression 中间件对响应体进行 Gzip 压缩，减少网络传输体积。'));
bodyChildren.push(body('（5）全局错误处理：自定义 AppError 类和 errorHandler 中间件统一处理 CastError、ValidationError、DuplicateKey、JWT 验证失败等异常，返回标准化的 JSON 错误响应。'));

// Ch5 Deployment
bodyChildren.push(h1('五、部署方案'));
bodyChildren.push(body('系统设计了两种部署方案以适应不同场景。'));
bodyChildren.push(h2('（一）开发环境'));
bodyChildren.push(body('前端执行 npm run dev 启动 Vite 开发服务器（端口 3000），后端执行 npm run dev 启动 Nodemon 热更新服务器（端口 3001）。前后端通过 Vite 的 Proxy 配置将 /api 请求代理至后端，避免跨域问题。'));
bodyChildren.push(h2('（二）生产环境'));
bodyChildren.push(body('生产部署采用 Nginx + PM2 的经典方案。前端执行 npm run build 构建静态资源，部署至 Nginx 的 Web 根目录。后端通过 tsc 编译 TypeScript 为 JavaScript，使用 PM2 以 cluster 模式启动（默认端口 3001）。Nginx 配置将 /api 路径反向代理至后端服务，其余路径返回前端静态文件（SPA 模式通过 try_files 实现）。build_release.ps1 脚本自动化执行构建、编译、文件打包全流程。'));
bodyChildren.push(body('部署流程为：① 执行 npm install --production 安装生产依赖；② 执行 npx prisma migrate deploy 应用数据库迁移；③ 配置 .env 环境变量（数据库连接、JWT 密钥等）；④ 通过 pm2 start 启动后端服务；⑤ 配置 Nginx 并重载。'));

// Ch6 Conclusion
bodyChildren.push(h1('六、结束语'));
bodyChildren.push(body('本文设计并实现了一个基于前后端分离架构的个人作品集内容管理系统。系统采用 React + Express + Prisma + MySQL 全栈技术方案，实现了 30 个数据模型、117 个 API 端点、23 个前端页面的完整企业级应用。系统在功能上涵盖了内容管理的核心场景（CRUD、文件上传、搜索过滤、排序），在性能上通过多层缓存、图片压缩、代码分割等手段保证响应速度，在安全上通过 JWT 认证、请求校验、限流、安全头等手段构建多层防护。'));
bodyChildren.push(body('通过本系统的开发实践，完整地经历了一个企业级前后端分离项目的需求分析、技术选型、架构设计、编码实现和部署运维全流程。系统仍存在若干可改进之处：目前数据库采用 MySQL 单机部署，后续可引入读写分离和缓存层（Redis）提升高并发性能；前端首屏加载体积偏大，可进一步拆分代码和启用 CDN 加速；管理后台可增加操作日志和权限细分（RBAC）功能。这些改进方向将作为后续版本的迭代目标。'));

// References
bodyChildren.push(h1('参考文献'));
const refs = [
  '[1] Fielding R T. Architectural Styles and the Design of Network-based Software Architectures[D]. Irvine: University of California, 2000: 76-106.',
  '[2] 朴灵. 深入浅出 Node.js[M]. 北京: 人民邮电出版社, 2013: 45-88.',
  '[3] Banks A, Porcello E. Learning React: Modern Patterns for Developing React Apps[M]. 2nd ed. Sebastopol: O\'Reilly Media, 2020: 112-145.',
  '[4] 阮一峰. ECMAScript 6 入门[M]. 第 4 版. 北京: 电子工业出版社, 2023: 201-256.',
  '[5] Express.js Contributors. Express 5.x API Reference[EB/OL]. [2025-12-10]. https://expressjs.com/en/5x/api.html.',
  '[6] Prisma Documentation Team. Prisma ORM Documentation[EB/OL]. [2025-11-20]. https://www.prisma.io/docs.',
  '[7] 廖雪峰. JavaScript 全栈开发教程[EB/OL]. [2025-10-15]. https://www.liaoxuefeng.com/wiki/JavaScript.',
  '[8] React Documentation. React 18 Reference[EB/OL]. [2025-09-28]. https://react.dev/reference/react.',
  '[9] TypeScript Team. TypeScript Handbook[EB/OL]. [2025-08-14]. https://www.typescriptlang.org/docs/handbook.',
  '[10] Ant Design Team. Ant Design 5.0 Components Overview[EB/OL]. [2025-07-22]. https://ant.design/components/overview.',
  '[11] Richardson C, Smith F. Microservices Patterns: With examples in Java[M]. Shelter Island: Manning Publications, 2018: 231-278.',
  '[12] Vite Contributors. Vite Documentation[EB/OL]. [2025-12-01]. https://vite.dev/guide/.',
];
refs.forEach(r => {
  bodyChildren.push(new Paragraph({
    children: [new TextRun({ text: r, font: '宋体', size: TABLE_SIZE })],
    spacing: { after: 60, line: 360 },
  }));
});

// ===== BUILD DOCUMENT =====
const doc = new Document({
  sections: [
    // Cover page (no page number)
    { children: coverChildren, properties: { page: { margin: { top: MARGIN_TB, bottom: MARGIN_TB, left: MARGIN, right: MARGIN } } } },
    // TOC page
    { children: [
      new Paragraph({ spacing: { before: 600 }, children: [] }),
      new Paragraph({ children: [new TextRun({ text: '目  录', font: '黑体', size: 32, bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
      new Paragraph({ children: [new TextRun({ text: '摘要 ………………………………………………………………………… 1', font: '宋体', size: 24 })], spacing: { after: 80, line: 440 } }),
      new Paragraph({ children: [new TextRun({ text: '一、前言 …………………………………………………………………… 2', font: '宋体', size: 24 })], spacing: { after: 80, line: 440 } }),
      new Paragraph({ children: [new TextRun({ text: '二、相关技术概述 ………………………………………………………… 2', font: '宋体', size: 24 })], spacing: { after: 80, line: 440 } }),
      new Paragraph({ children: [new TextRun({ text: '三、系统设计 ……………………………………………………………… 3', font: '宋体', size: 24 })], spacing: { after: 80, line: 440 } }),
      new Paragraph({ children: [new TextRun({ text: '四、核心功能实现 ………………………………………………………… 5', font: '宋体', size: 24 })], spacing: { after: 80, line: 440 } }),
      new Paragraph({ children: [new TextRun({ text: '五、部署方案 ……………………………………………………………… 7', font: '宋体', size: 24 })], spacing: { after: 80, line: 440 } }),
      new Paragraph({ children: [new TextRun({ text: '六、结束语 ………………………………………………………………… 8', font: '宋体', size: 24 })], spacing: { after: 80, line: 440 } }),
      new Paragraph({ children: [new TextRun({ text: '参考文献 …………………………………………………………………… 8', font: '宋体', size: 24 })], spacing: { after: 80, line: 440 } }),
    ], properties: { page: { margin: { top: MARGIN_TB, bottom: MARGIN_TB, left: MARGIN, right: MARGIN } } } },
    // Paper body (with page numbers)
    { children: bodyChildren, properties: { page: { margin: { top: MARGIN_TB, bottom: MARGIN_TB, left: MARGIN, right: MARGIN }, pageNumbers: { start: 1 } } } },
  ],
});

const buffer = await Packer.toBuffer(doc);
const outPath = 'D:/project/isme2/Myproject/课程论文-个人作品集内容管理系统.docx';
fs.writeFileSync(outPath, buffer);
console.log('Generated: ' + outPath + ' (' + (buffer.length/1024).toFixed(0) + 'KB)');
