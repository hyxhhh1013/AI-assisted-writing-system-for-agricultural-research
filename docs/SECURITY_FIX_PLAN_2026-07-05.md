# 安全与数据完整性修复计划（PR 级）

> 编写日期：2026-07-05
> 依据：`AUDIT_REPORT_2026-07-05.md` + 并发维度深审 + 安全定向核查
> 目标读者：执行 agent。每个 PR 独立可合并、可回滚。
> 约定：所有改前 `rg` 引用，改后跑 `npx tsc --noEmit` + 相关 `npx vitest run`；commit 形如 `fix(sec): xxx (ENG-PR-SEC-xx)`。

---

## 0. 已验证安全（无需处理，避免重复劳动）

| 项 | 结论 | 证据 |
|----|------|------|
| SSRF（文献检索） | ✅ 安全 | `src/lib/literature-search.ts` 仅请求 4 个硬编码官方域名（openalex/semanticscholar/crossref/pubmed），query 经 `encodeURIComponent` |
| 命令注入（Python 子进程） | ✅ 安全 | `chart/route.ts:82`、`mol-diagram/route.ts:77`、`flow-diagram/route.ts:70`、`table/route.ts:43` 均用 `spawn(PYTHON_CMD, [args], { shell: false })`，参数数组传 |
| 路径穿越（图表文件读取） | ✅ 安全 | `charts/[filename]/route.ts:10` UUID 正则白名单 |
| 路径穿越（PDF 读取） | ✅ 安全 | `pdf/route.ts:26` 调 `assertSafePathSegment`，`safe-path.ts` 禁 `..`/`/`/`\`/`\0` |
| 路径穿越（知识库全文） | ✅ 安全 | `rag.ts:775` `getFullText` 用 `path.basename()` 归一化后只匹配 chunk 元数据 |
| 越权（项目 GET） | ✅ 安全 | `projects/route.ts:41` `findFirst({ where: { id, userId } })` |

---

## 1. 问题总览与 PR 拆分

| PR | 优先级 | 主题 | 严重度 | 预计 |
|----|--------|------|--------|------|
| SEC-01 | P0 | `/api/directions/*` 鉴权 + owner + AI 限流 | 🔴 致命 | 3-4h |
| SEC-02 | P0 | 补齐未鉴权 AI 路由 + 限流覆盖 | 🔴 致命 | 1-2h |
| SEC-03 | P0 | JSONB 增量 PATCH 竞态（3 处）+ Reference.order 唯一约束 | 🔴 高 | 3-4h |
| SEC-04 | P1 | SSE 透传 abort + lastRefMapping 合并 | 🟡 中 | 1-2h |
| SEC-05 | P1 | 上传校验 + Python 子进程超时/清理 | 🟡 中 | 1-2h |
| SEC-06 | P1 | XSS：两处 dangerouslySetInnerHTML 消毒 | 🟡 中 | 1h |
| SEC-07 | P2 | createProjectFromRoadmap 事务化 + auto-save 增量 + 创建幂等 | 🟡 中 | 2-3h |
| SEC-08 | P2 | reindex 原子化 + cookie Secure | 🟢 低 | 1-2h |

---

## PR-SEC-01：`/api/directions/*` 鉴权 + owner + AI 限流（P0/致命）

### 问题
- `src/proxy.ts` 的 `matcher` 与 `protectedApis` **均不含 `/api/directions`** → proxy 不拦截，无 JWT 校验。
- `src/app/api/directions/route.ts` GET/POST 与所有子路由（`assets`/`analyze`/`roadmap`/`parse-asset`/`grant-proposal`/`experiment-plan`/`evaluation-contract`）内部**不读 `x-user-id`、不校验**。
- `prisma/schema.prisma:285` `Direction` 模型**无 `userId` 字段** → 方向全局共享，任何人可读/写/删任何方向。
- `analyze`/`parse-asset`/`roadmap`/`grant-proposal`/`experiment-plan`/`evaluation-contract` 调 AI（`callAINonStreaming`/`callAIZero`），**无鉴权 + 无限流** → 匿名用户可无上限烧 DeepSeek/Zhipu 额度。

### 影响场景
未登录用户 curl `POST /api/directions/<任意slug>/analyze` 即可触发 10 维 AI 分析；批量并发可耗尽 API 额度（DoS / 成本攻击）。任意用户可篡改他人方向的资产、路线图。

### 修复方案
**决策点（执行前向维护者确认）**：directions 是「每用户私有」还是「全局共享只读 + 管理员可写」？默认按**每用户私有**修复（与 Project 一致）。

#### Step 1 — Schema 加 owner + 迁移
- `prisma/schema.prisma` `model Direction` 增加：
  ```prisma
  userId String @relation("UserDirections", fields: [userId], references: [id], onDelete: Cascade)
  user   User   @relation("UserDirections", references: [id])
  @@index([userId])
  ```
- 生成迁移：`npx prisma migrate dev --name direction_owner`。
- **数据回填**：现有 Direction 行需指派给一个用户。写一次性脚本 `scripts/migrate-direction-owner.ts`，将存量方向挂到指定管理员 userId（或第一用户），并在 `docs/DATA_MODEL.md` 记录。

#### Step 2 — proxy 放行 + 限流
- `src/proxy.ts`：
  - `protectedApis` 增加 `"/api/directions"`；
  - `matcher` 增加 `"/api/directions/:path*"`；
  - `aiEndpoints` 增加 `"/api/directions"`（或对所有 directions AI 子路由限流，见 SEC-02 统一方案）。

#### Step 3 — 路由层 owner 作用域
- `directions/route.ts`：
  - GET `findMany({ where: { userId, ... } })`；
  - POST `create({ data: { userId, ... } })`。
- `directions/[slug]/route.ts`：GET/PUT/DELETE `findFirst({ where: { slug, userId } })`，未命中返回 404（勿泄露存在性）。
- 所有子路由（`assets`/`analyze`/`scan`/`parse-asset`/`roadmap`/`paper-brief`/`experiment-plan`/`evaluation-contract`/`grant-proposal`）：先 `findFirst({ where: { slug, userId }, select: { id: true } })` 鉴权再操作。
- 抽 `src/lib/direction-auth.ts` 导出 `assertDirectionOwned(slug, userId)` 复用。

#### Step 4 — 客户端
- `src/services/direction.ts` 调用本就带 cookie，无需改；确认 `createProjectFromRoadmap` 流程在鉴权后仍通。

### 交付标准
- [ ] 未登录请求任一 `/api/directions/*` 返回 401。
- [ ] 用户 A 无法 GET/PUT/DELETE 用户 B 的方向（返回 404）。
- [ ] `analyze` 等 AI 路由命中限流（超过阈值 429）。
- [ ] `npx tsc --noEmit` 通过；`npx prisma migrate dev` 干净执行。
- [ ] `docs/DATA_MODEL.md` 更新 Direction 字段；`docs/API_INDEX.md` 标注 directions 需登录。

### 验收命令
```bash
# 未鉴权应 401
curl -i http://localhost:3000/api/directions
curl -i -X POST http://localhost:3000/api/directions/some-slug/analyze -H "content-type: application/json" -d '{}'
```

### 回滚
迁移向前兼容（userId 可空后再回填）；回滚需先 `prisma migrate resolve --rolled-back` + 还原 proxy/路由代码。

---

## PR-SEC-02：补齐未鉴权 AI 路由 + 限流覆盖（P0/致命）

### 问题
经核查，以下路由**不在 proxy matcher / protectedApis**，且内部无 `x-user-id` 校验：

| 路由 | 调 AI？ | 风险 |
|------|--------|------|
| `/api/review` | ✅ 四维度并行 AI | 🔴 匿名烧 token |
| `/api/data/analyze` | ❌（纯统计） | 🟡 仅资源 |
| `/api/figures/registry` | ❌ | 🟢 低 |
| `/api/presentation/stats` | ❌ | 🟢 低 |

另：`src/proxy.ts:41` `aiEndpoints` 仅 5 项（writing/analysis/outline/chat/translate），**遗漏**：`/api/plagiarism`（check/rewrite/v2）、`/api/review`、`/api/directions/*/AI`、`/api/knowledge/analyze`、`/api/consistency/fix`。

### 修复方案
#### Step 1 — 统一鉴权
- `src/proxy.ts` `protectedApis` 与 `matcher` 增加：`/api/review`、`/api/data`、`/api/figures`、`/api/presentation`。
- 确认 `/api/consistency` 与 `/api/consistency/fix` 已在 protectedApis（已含 `/api/consistency` 前缀，确认 fix 子路径被覆盖）。

#### Step 2 — 统一 AI 限流
- 将 `aiEndpoints` 改为「按需声明全部 AI 路由前缀」：
  ```ts
  const aiEndpoints = [
    "/api/writing", "/api/analysis", "/api/outline", "/api/chat", "/api/translate",
    "/api/plagiarism", "/api/review", "/api/knowledge/analyze",
    "/api/consistency/fix", "/api/directions",
  ];
  ```
- 限流 store 当前进程内 `Map`（`proxy.ts:44`）。单实例可接受；多实例需换 Redis（标注 TODO，不在本 PR）。
- 限流 key 当前用 `userId ?? x-forwarded-for ?? "anonymous"`：`x-forwarded-for` 可伪造，但仅作用于匿名场景（已 401）。保留。

#### Step 3 — 路由内部兜底
- `/api/review/route.ts`、`/api/data/analyze/route.ts` 起手读 `getUserIdFromRequest(req)`，无则 `unauthorizedResponse()`（与 `projects/route.ts:24` 一致）。

### 交付标准
- [ ] 未登录请求上述路由均 401。
- [ ] 登录后超阈值调用 `/api/review` 返回 429 + `Retry-After`。
- [ ] `npx tsc --noEmit` 通过。

### 验收命令
```bash
curl -i http://localhost:3000/api/review -X POST -H "content-type: application/json" -d '{}'          # 401
curl -i http://localhost:3000/api/data/analyze -X POST -H "content-type: application/json" -d '{}'   # 401
```

### 回滚
还原 proxy.ts 两个数组 + 路由首行鉴权。

---

## PR-SEC-03：JSONB 增量 PATCH 竞态 + Reference.order 唯一约束（P0/高）

### 问题（来自并发深审，已验证）
1. `directions/[slug]/assets/route.ts:32-70`：读 `assets` JSONB → 内存改 → 整字段 `update`，无事务/无行锁/无乐观锁。
2. `projects/[id]/charts/route.ts:31` + `lib/project-charts.ts:10-49`：同模式。
3. `projects/route.ts:162-235` POST：多步写（project→blueprint→sections→references→analysisResults）无事务；且 references/analysisResults 用 `deleteMany + 重建`，**违反 AGENTS.md S2「禁止全量 POST 覆盖」**。
4. `lib/project-references.ts:11-24`：`count()` 算 order 后 increment，`schema.prisma` Reference 仅有 `@@index([projectId, order])` **无 `@@unique`** → 并发产生重复 order → `[N]` 编号错乱。

### 修复方案
#### Step 1 — Reference 唯一约束（最先做，独立小 PR）
- `prisma/schema.prisma` Reference 模型加 `@@unique([projectId, order])`。
- 迁移前先跑清理脚本 `scripts/dedup-reference-order.ts`：按 `(projectId, order)` 去重，重排连续。
- `lib/project-references.ts` create 处捕获 Prisma `P2002`，重试（重算 max(order)+1，最多 3 次）。
- 可选更稳：`$queryRaw\`SELECT pg_advisory_xact_lock(hashtext($1))\`` 串行化同项目重排。

#### Step 2 — assets / charts PATCH 事务化
- 用 `$transaction` + 行锁：
  ```ts
  await prisma.$transaction(async (tx) => {
    const row = await tx.$queryRaw`SELECT assets FROM "Direction" WHERE slug = ${slug} FOR UPDATE`;
    // read-modify-write within tx
    await tx.direction.update({ where: { slug }, data: { assets: next } });
  });
  ```
- charts 同理（锁 `Project` 行）。
- 或更优：改 PG `jsonb_set` 原子操作（避免读改写）。评估复杂度后二选一，**优先事务+行锁**（改动小、语义清晰）。

#### Step 3 — projects POST 事务化 + 去全量覆盖
- 整段包 `$transaction`。
- references/analysisResults 不再 deleteMany+重建：前端 `saveProject` 已剥离这两项（AGENTS.md 注），确认 sections 也迁到增量 `PATCH /sections/[key]`，POST 仅做 create + 基础字段。

#### Step 4 — 乐观锁兜底（可选加固）
- 给 Project/Direction 的 PATCH 加 `where: { id, updatedAt: expectedAt }`，count=0 返回 409，前端重试。

### 交付标准
- [ ] 并发 10 路 PATCH 同一方向 assets，无丢失更新（写后计数 = 写前 + 净增量）。
- [ ] 并发添加 reference 不产生重复 order（`SELECT count(*) FILTER (WHERE order 重复) = 0`）。
- [ ] projects POST 任一步失败整体回滚（手动制造 reference 冲突验证）。
- [ ] 新增 vitest：`__tests__/services/direction-assets-concurrency.test.ts`、`project-references-order.test.ts`。
- [ ] `npx tsc --noEmit` + `npx vitest run` 通过。

### 验收命令
```bash
npx vitest run __tests__/services/direction-assets-concurrency.test.ts
npx prisma migrate dev --name reference_order_unique
```

### 回滚
迁移可回滚（drop unique）；事务代码还原为原 read-modify-write。

---

## PR-SEC-04：SSE 透传 abort + lastRefMapping 合并（P1/中）

### 问题
1. `/api/chat/route.ts:53-85`、`/api/translate/route.ts:22-48`、`/api/plagiarism/v2/route.ts:54-83`、`/api/directions/[slug]/analyze/route.ts:319-572`：客户端断开后上游 AI 流继续消耗 token（未传 `req.signal`）。
2. `use-writing-panel-generate.ts:95,354-363`：`setLastRefMapping(streamResult.refMapping)` 整体替换，多 bullet 扩写时前序映射丢失。

### 修复方案
#### Step 1 — 透传 signal
- `callAI({ ..., signal: req.signal })`、`streamAIResponse(response, req.signal)`。
- `runPlagiarismCheck` 增加 `signal` 参数，透传到内部 fetch。
- `directions/analyze`：每批次前 `if (req.signal.aborted) return`；`callAINonStreaming` 传 signal（需扩展其签名支持）。
- 参照 `/api/writing/route.ts`（已正确处理）。

#### Step 2 — lastRefMapping 合并
```ts
setLastRefMapping(prev => ({ ...(prev ?? {}), ...streamResult.refMapping }));
```
`batchUpsertReferences` 累积全部 mapping 后一次性提交。

### 交付标准
- [ ] curl 触发 `/api/chat` 后立即断开，服务端日志确认 AI 调用被 abort（无后续 token 计费）。
- [ ] 多 bullet collaborative 扩写后，`batchUpsertReferences` 持久化全部引用映射（数量 = 各 bullet 之和）。
- [ ] `npx tsc --noEmit` 通过。

### 回滚
还原 signal 参数缺省、setLastRefMapping 还原替换语义。

---

## PR-SEC-05：上传校验 + Python 子进程超时/清理（P1/中）

### 问题
1. `knowledge/route.ts:168-226` POST 上传：**无文件类型校验**（接受任意文件）、**无大小限制**（`Buffer.from(await file.arrayBuffer())` 全量入内存）→ 内存 DoS / 磁盘填充；reindex 会拿非 PDF 喂 Python 解析器可能崩溃。路径穿越已由 `resolveKnowledgeFilePath` 拦截，安全。
2. `chart/route.ts:80-118` 等 4 处 Python `spawn`：**无 timeout/kill**，Python 挂起则请求挂到 `maxDuration`，子进程僵死。临时目录在 `close` 里清理，但 `error` 路径不清理（`chart/route.ts:114` 未 `rmSync`）。

### 修复方案
#### Step 1 — 上传校验
- `knowledgeUploadFieldsSchema`（`lib/validations.ts`）增加：
  - 文件名白名单：`/^[\\w.\\-\\u4e00-\\u9fa5 ]+\\.(pdf)$/i`（仅 PDF；若支持其他类型按需扩）。
  - 大小上限：路由层 `if (file.size > MAX_UPLOAD_BYTES) return 413`，`MAX_UPLOAD_BYTES = 100 * 1024 * 1024`（可配 env）。
  - MIME 校验：`file.type === "application/pdf"`（仅作辅助，易伪造，主靠扩展名 + 解析）。
- 超大文件改流式写盘（避免全量入内存）：用 `file.stream()` pipe 到 `fs.createWriteStream`。

#### Step 2 — Python 子进程超时
- 抽 `src/lib/python-runner.ts` 统一 `runPython(script, args, { timeoutMs })`：
  - `proc.setTimeout(timeoutMs, () => proc.kill('SIGKILL'))`；
  - `close`/`error` 均在 `finally` 里 `fs.rmSync(tmpDir, { recursive: true, force: true })`；
  - 超时返回 504。
- 4 处路由（chart/mol-diagram/flow-diagram/table）改用该 runner，删除各自重复的 spawn 样板。

### 交付标准
- [ ] 上传 `.exe` / 200MB 文件分别返回 400 / 413。
- [ ] Python 挂起模拟（脚本 `time.sleep`）在 timeoutMs 后返回 504，子进程已 kill，tmp 目录已清。
- [ ] `npx tsc --noEmit` 通过。

### 回滚
还原各路由内联 spawn；上传校验还原。

---

## PR-SEC-06：XSS — 两处 dangerouslySetInnerHTML 消毒（P1/中）

### 问题
1. `src/components/shared/plot-insert-dialog.tsx:211`：`dangerouslySetInnerHTML={{ __html: contentHtml }}`，`contentHtml` 来自 `src/app/plot/plot-page-client.tsx:235` 的 `html`，源自 `/api/flow-diagram`（graphviz SVG）/`/api/mol-diagram` 的 Python 输出。若用户输入（节点标签、标题）未经 HTML 转义拼入 SVG，可注入 `<script>`/`onload=`。
2. `src/components/shared/table-panel.tsx:249`：`result.html` 来自 `/api/table` Python 三线表生成，单元格值若未转义则可注入。

### 修复方案
#### Step 1 — 服务端消毒（首选）
- 在 Python 脚本（`scripts/charts/` 对应 flow/mol/table）输出 HTML 前对所有用户可控字符串 `html.escape()`（Python）。这是根因修复。
#### Step 2 — 客户端兜底
- 引入 `dompurify`（已在依赖则直接用，否则 `npm i dompurify`），封装 `src/lib/sanitize-html.ts`：
  ```ts
  import DOMPurify from "isomorphic-dompurify";
  export const sanitizeHtml = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { svg: true, html: true } });
  ```
- 两处 `dangerouslySetInnerHTML` 改为 `sanitizeHtml(contentHtml)` / `sanitizeHtml(result.html)`。
- SVG 场景需允许 `<svg>` 标签但禁 `<script>`，配 `FORBID_TAGS: ['script']`、`FORBID_ATTR: ['onload','onclick',...]`。

### 交付标准
- [ ] 构造含 `<img src=x onerror=alert(1)>` 的节点标签/单元格，渲染后无脚本执行（DOM 中无 onerror 属性）。
- [ ] 正常 SVG/表格渲染不受影响（视觉回归）。
- [ ] `npx tsc --noEmit` + 相关组件 vitest 通过。

### 回滚
移除 sanitize 调用；Python escape 还原。

---

## PR-SEC-07：createProjectFromRoadmap 事务化 + auto-save 增量 + 创建幂等（P2/中）

### 问题
1. `services/direction.ts:357-452` `createProjectFromRoadmap`：建项目→导文献→生成蓝图→更新路线图，每步 try/catch 静默吞错，失败留孤儿项目 + 路线图状态未同步。
2. `hooks/use-auto-save.ts`：10s 全量 POST，与增量 PATCH 并发会用 stale state 覆盖 DB 新内容。
3. `POST /api/projects` 无幂等键，`fetchWithRetry` 或双击产生重复项目。

### 修复方案
#### Step 1 — 聚合端点 + 事务
- 新增 `POST /api/directions/[slug]/roadmap/create-project`（服务端），整段 `$transaction`：建项目 + 写 references + 更新 roadmap 状态。blueprint AI 调用若失败，事务回滚项目创建；或先建项目，blueprint 失败标记 `blueprintStatus: pending`，前端可重试（推荐后者，避免长事务持 AI 调用）。
- 失败补偿：若已建项目但后续失败，`tx.project.delete({ where: { id } })`。

#### Step 2 — auto-save 增量化
- `use-auto-save` 改为对「脏 section」逐个 `PATCH /api/projects/[id]/sections/[key]`，不再全量 POST。
- 或 POST 带 `lastUpdated` 乐观锁，stale 返回 409 → 客户端 refetch 后再保存。

#### Step 3 — 创建幂等
- 客户端生成 `clientRequestId`（uuid），`POST /api/projects` body 携带；DB 加 `@@unique([userId, clientRequestId])`（schema 加可空字段 `clientRequestId String? @unique`），重复提交命中 P2002 返回原项目。

### 交付标准
- [ ] blueprint 步骤失败后，无孤儿项目（验证 DB 无 `blueprintStatus=pending` 之外的残留）。
- [ ] 双击创建按钮只产生一个项目。
- [ ] 多 tab 编辑不会互相覆盖（手动或 vitest）。
- [ ] `npx tsc --noEmit` + vitest 通过。

### 回滚
还原 services/direction.ts 调用链；auto-save 还原全量；移除 clientRequestId。

---

## PR-SEC-08：reindex 原子化 + cookie Secure（P2/低）

### 问题
1. `knowledge/reindex/route.ts:122-180`：spawn `index-pdfs.mjs` 中途崩溃留下半成品索引，无原子切换、无续建。
2. `lib/auth.ts:66` cookie 不设 `Secure`（依赖 Nginx SSL）。若 Nginx 配置失误或直接暴露 Next 端口，cookie 可经 HTTP 明文传输。

### 修复方案
#### Step 1 — reindex 原子化
- 子进程写临时目录 `data/.index-staging-<ts>/`，全部完成后原子 `rename` 到正式索引目录；失败删 staging。
- 写 `data/.index-manifest.json` 记录状态；启动时检测未完成并提示续建/清理。

#### Step 2 — cookie Secure（可选）
- `getSecureFlag()` 读 `process.env.COOKIE_SECURE === "true"` 时返回 `; Secure`。
- 生产 env 设 `COOKIE_SECURE=true`（前提是 Nginx 终止 SSL 且 Next 经 HTTPS 反代，或 Next 本身 HTTPS）。保持默认空以兼容当前 HTTP 内部通信。

### 交付标准
- [ ] 模拟 reindex 中途 kill 子进程，正式索引目录未损坏（仍可读旧索引），staging 被清理。
- [ ] 生产环境 cookie 带 `Secure`（浏览器 DevTools 验证）。
- [ ] `npx tsc --noEmit` 通过。

### 回滚
还原 reindex 直写；cookie 还原默认。

---

## 执行顺序建议

```
SEC-03 Step1 (Reference unique)  ──┐
SEC-02 (鉴权补齐，最快降风险)      ├──→ SEC-01 (directions 大改，依赖迁移)
SEC-04 (SSE abort)                 │
SEC-05/06 (上传/XSS)               │
SEC-03 Step2-4 (PATCH 事务)        ─┘
SEC-07 / SEC-08 (后续)
```

**先合 SEC-02**（1-2h，立即堵住匿名 AI 调用），再合 **SEC-01**（迁移 + owner），**SEC-03** 并行。

## 全局验收清单（每个 PR 合并前）
- [ ] `rg` 已搜引用，未误改 `backup_*`
- [ ] 无组件内新增裸 `fetch`
- [ ] 项目保存走增量 PATCH（若 touched）
- [ ] `npx tsc --noEmit` 通过
- [ ] `npx vitest run` 相关用例通过
- [ ] 命中 S0 更新表时已改 `docs/`（DATA_MODEL / API_INDEX / domain）
- [ ] 接力 PR 已更新 `docs/ENGINEERING_OPTIMIZATION_QUEUE.md` §1 + §4

---

## 附录：关键文件清单

| PR | 文件 |
|----|------|
| SEC-01 | `src/proxy.ts`、`prisma/schema.prisma`、`src/app/api/directions/**`、`src/lib/direction-auth.ts`(新)、`scripts/migrate-direction-owner.ts`(新) |
| SEC-02 | `src/proxy.ts`、`src/app/api/{review,data,figures,presentation}/**/route.ts` |
| SEC-03 | `prisma/schema.prisma`、`src/lib/{project-references,project-charts}.ts`、`src/app/api/{directions/[slug]/assets,projects/[id]/charts,projects}/route.ts`、`scripts/dedup-reference-order.ts`(新) |
| SEC-04 | `src/app/api/{chat,translate,plagiarism/v2,directions/[slug]/analyze}/route.ts`、`src/hooks/use-writing-panel-generate.ts`、`src/lib/ai.ts`(signal 透传) |
| SEC-05 | `src/app/api/knowledge/route.ts`、`src/lib/validations.ts`、`src/lib/python-runner.ts`(新)、`src/app/api/{chart,mol-diagram,flow-diagram,table}/route.ts` |
| SEC-06 | `scripts/charts/**`(flow/mol/table)、`src/lib/sanitize-html.ts`(新)、`src/components/shared/{plot-insert-dialog,table-panel}.tsx`、`src/app/plot/plot-page-client.tsx` |
| SEC-07 | `src/services/direction.ts`、`src/app/api/directions/[slug]/roadmap/create-project/route.ts`(新)、`src/hooks/use-auto-save.ts`、`src/app/api/projects/route.ts` |
| SEC-08 | `src/app/api/knowledge/reindex/route.ts`、`scripts/index-pdfs.mjs`、`src/lib/auth.ts` |
