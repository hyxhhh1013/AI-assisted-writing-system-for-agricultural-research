# 论文质量中心 UX 重做（QUALITY-UX）

> 状态：done（2026-09-08）  
> 范围：提交前查重 / 降重 / 审查。**不改**查重算法与审查 prompt。

## 诊断（一句话）

后端七层查重 + 四维审查已经齐，页面仍是「粘贴框 + 四 Tab 拼盘 + 工作台窄栏第二套 UI」。

## 目标态

```
/plagiarism?id=
├─ 总览（默认）：相似度 / 审查分 / 检测层 / 待处理 / 开工 CTA
├─ 查重工位：配置（含检测层）→ 真实阶段进度 → 仪表报告
├─ 降重工位：原文 vs 建议并排，采纳即标记，写回项目
├─ 审查工位：单一 CTA、按严重度筛选、按章节写回
└─ 历史：头栏抽屉，不再占第四个主 Tab
```

工作台 `plagiarism` Tab → **入口卡**（跳转质量中心），不再维护 compact 查重。

## 任务

| ID | 内容 |
|----|------|
| QUALITY-UX-001 | 总览 + 工位导航；`tab=overview` 默认；历史进 Dialog |
| QUALITY-UX-002 | 检测层接入、阶段进度条、报告仪表 + 类型筛选 |
| QUALITY-UX-003 | 降重并排预览；采纳不再先复制剪贴板 |
| QUALITY-UX-004 | 审查单按钮；问题列表；`resolveIssueSectionKey` 写回 |
| QUALITY-UX-005 | 工作台 `QualityHubCard`；首页文案；死代码不再挂载 |

## 不变量

- 业务只在 `plagiarism-service.ts` / `review-service.ts`
- 组件不新增裸 `fetch`
- 章节写回走增量 PATCH / `persistQualitySections`
- `/review?id=` 仍重定向 `/plagiarism?id=&tab=review`
- URL 兼容：`tab=check|result|rewrite|review|history`
