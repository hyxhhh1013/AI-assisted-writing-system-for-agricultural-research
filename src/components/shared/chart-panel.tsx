"use client";

import { ChartWorkspace } from "@/components/shared/chart/chart-workspace";
import type { ChartPanelPrefill } from "@/contracts/figure";
import type { ChartRegistryField } from "@/contracts/chart-style";

interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  example?: string;
  config_fields?: ChartRegistryField[];
}

interface ChartPanelProps {
  projectId: string;
  onInsertToPaper: (imageUrl: string, caption: string) => void;
  registryEntry?: RegistryEntry;
  globalStyleFields?: ChartRegistryField[];
  prefill?: ChartPanelPrefill | null;
  /** @deprecated 图表类型改由 plot 页左侧导航选择 */
  layout?: "vertical" | "horizontal";
}

export function ChartPanel({
  projectId: _projectId,
  onInsertToPaper,
  registryEntry,
  globalStyleFields,
  prefill,
}: ChartPanelProps) {
  return (
    <ChartWorkspace
      registryEntry={registryEntry}
      globalStyleFields={globalStyleFields}
      prefill={prefill}
      projectId={_projectId !== "default" ? _projectId : undefined}
      onInsertToPaper={onInsertToPaper}
    />
  );
}
