#!/bin/sh

# 文档同步铁律检查（告警，不阻断提交）
# 规则来源：AGENTS.md S0「文档同步铁律」——功能/修复提交前必须同步受影响文档。
# 逻辑：本次暂存区有代码净改动（src/ prisma/ scripts/，排除纯测试）但没有任何文档改动 → 黄色告警。
# 告警不阻断：确有无需更新的场景（纯格式化/纯测试/纯重构无对外影响），提交者可显式声明。

DOC_SYNC_CHECK_STAGED=$(git diff --cached --name-only)
DOC_SYNC_CODE_CHANGED=$(printf '%s\n' "$DOC_SYNC_CHECK_STAGED" \
  | grep -E '^(src/|prisma/|scripts/)' \
  | grep -v -E '(\.test\.(ts|tsx|js|jsx)$|/__tests__/|\.spec\.)' \
  | head -1)
DOC_SYNC_DOCS_CHANGED=$(printf '%s\n' "$DOC_SYNC_CHECK_STAGED" \
  | grep -E '^(docs/|AGENTS\.md|README\.md|CHANGELOG\.md)' \
  | head -1)

if [ -n "$DOC_SYNC_CODE_CHANGED" ] && [ -z "$DOC_SYNC_DOCS_CHANGED" ]; then
  echo ""
  echo "⚠️  文档同步铁律（AGENTS.md S0）：本次提交改了代码（$DOC_SYNC_CODE_CHANGED …）"
  echo "    但未暂存任何文档改动（docs/ | AGENTS.md | README.md | CHANGELOG.md）。"
  echo "    → 请确认对应 docs/ 是否已更新；确无需更新时，commit message 显式声明："
  echo "      docs: 无需更新（理由）"
  echo ""
fi
