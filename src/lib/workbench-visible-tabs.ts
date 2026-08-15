/** 工作台主栏 vs 专家工具（W3-AP-HUB-02）。深链 ?tab=data 仍可用。 */

export const WORKBENCH_EXPERT_TAB_IDS = ["data", "xrd", "outline", "writing"] as const;

export type WorkbenchExpertTabId = (typeof WORKBENCH_EXPERT_TAB_IDS)[number];

export function isWorkbenchExpertTab(id: string): id is WorkbenchExpertTabId {
  return (WORKBENCH_EXPERT_TAB_IDS as readonly string[]).includes(id);
}

/** NEXT_PUBLIC_WORKBENCH_EXPERT_TABS=1 时恢复旧的全 Tab 图标栏 */
export function shouldShowAllWorkbenchTabs(): boolean {
  return process.env.NEXT_PUBLIC_WORKBENCH_EXPERT_TABS === "1";
}
