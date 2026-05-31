"use client";

import type { LucideIcon } from "lucide-react";

interface TabPanelShellProps {
  /** 面板标题 */
  title?: string;
  /** 标题图标 */
  icon?: LucideIcon;
  /** 标题右侧操作按钮 */
  actions?: React.ReactNode;
  /** 工具栏（如子工具切换按钮） */
  tools?: React.ReactNode;
  /** 内容区子元素 */
  children: React.ReactNode;
}

/**
 * 工作台 Tab 面板的统一布局外壳。
 * 提供一致的标题栏、可选工具栏、滚动内容区。
 */
export function TabPanelShell({
  title,
  icon: Icon,
  actions,
  tools,
  children,
}: TabPanelShellProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 标题栏 */}
      {(title || actions) && (
        <div className="shrink-0 flex items-center justify-between border-b border-border/50 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
            {title && (
              <h3 className="text-sm font-medium text-foreground truncate">
                {title}
              </h3>
            )}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
        </div>
      )}

      {/* 工具栏 */}
      {tools && (
        <div className="shrink-0 flex items-center gap-1 border-b border-border/50 bg-muted/30 px-2 py-1.5 overflow-x-auto">
          {tools}
        </div>
      )}

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-3 custom-scrollbar">
        {children}
      </div>
    </div>
  );
}
