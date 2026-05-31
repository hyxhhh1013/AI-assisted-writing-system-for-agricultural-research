# 项目健康检查

> 最近检查日期：2026-05-31  
> 目标：记录当前阻断项，避免后续开发误判项目状态。

## 验证结果

| 命令 | 结果 | 备注 |
|------|------|------|
| `npm run test` | 通过 | 18 个测试文件、141 个测试通过 |
| `npx prisma validate` | 通过 | `prisma/schema.prisma` 当前为 PostgreSQL |
| `npm run typecheck` | 失败 | JSX 解析错误阻断类型检查 |
| `npm run lint:src --quiet` | 失败 | 73 个 error |
| `npm run build` | 失败 | 受 JSX 解析、Google font 拉取、Turbopack 动态文件追踪影响 |

## 优先修复项

### P0：认证代理头传递错误

文件：`src/proxy.ts`

当前代码把 `x-user-id` 写入 response header。Next 16 中这会暴露给浏览器，不能作为下游 Route Handler 的可信 request header。正确做法是复制 request headers，设置 `x-user-id`，再通过 `NextResponse.next({ request: { headers } })` 传递。

影响范围：

- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/meta/route.ts`
- `src/app/api/projects/[id]/sections/[key]/route.ts`
- `src/lib/admin-auth.ts`
- `src/app/api/admin/*`

修复时同时移除或严格限制 `AUTH_BYPASS` 的硬编码用户注入，避免生产环境误开。

### P0：JSX 结构损坏导致无法构建

文件：

- `src/components/shared/outline-panel.tsx`
- `src/components/shared/writing-panel.tsx`

表现：

- `outline-panel.tsx` 中残留 `</>` / `}` / `>`，导致解析失败。
- `writing-panel.tsx` 关闭了 `</TabPanelShell>`，但当前 JSX 开头是普通 `div`。

### P1：组件引用不完整

文件：`src/components/shared/data-panel.tsx`

`DataPanel` 使用了 `<TabPanelShell>`，但缺少对应 import。修完 JSX 后这里会继续阻断 lint 或编译。

### P1：文件路径安全

文件：

- `src/app/api/knowledge/route.ts`
- `src/app/api/pdf/route.ts`

知识库上传、移动、删除、PDF 读取路径由用户输入拼接，修复时需要对文件名和分类做白名单校验，并在 `path.resolve` 后确认结果仍位于允许目录内。

### P1：生产构建与部署

当前构建还暴露两个部署风险：

- `next/font/google` 在无外网环境会拉取失败，建议改为本地字体或确保构建环境可访问 Google fonts。
- `src/app/api/knowledge/route.ts` 的动态文件路径让 Turbopack 追踪范围过宽，建议把运行时文件路径限定在静态子目录，必要时使用 `/*turbopackIgnore: true*/`。

## 修复后复验顺序

1. `npm run typecheck`
2. `npm run lint:src --quiet`
3. `npm run test`
4. `npm run build`
5. 登录后验证项目列表、项目保存、管理员接口、PDF 打开和知识库上传/移动/删除
