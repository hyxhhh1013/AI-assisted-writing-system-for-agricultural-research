"use client";

import type { ReactNode } from "react";
import { ChartWorkspace } from "@/components/shared/chart/chart-workspace";
import { TablePanel } from "@/components/shared/table-panel";
import { FlowCard } from "@/components/shared/xrd/flow-card";
import { MermaidMechanismCard } from "@/components/shared/plot/mermaid-mechanism-card";
import { MechanismPanelCard } from "@/components/shared/plot/mechanism-panel-card";
import { MolCard } from "@/components/shared/xrd/mol-card";
import { XrdWorkflowCard } from "@/components/shared/xrd/xrd-workflow-card";
import { PeakFitCard } from "@/components/shared/xrd/peakfit-card";
import { UnitCellCard } from "@/components/shared/xrd/unitcell-card";
import { AmorphousCard } from "@/components/shared/xrd/amorphous-card";
import { BraggCard } from "@/components/shared/xrd/bragg-card";
import { XpsCard } from "@/components/shared/xrd/xps-card";
import { StackCard } from "@/components/shared/xrd/stack-card";
import { ScherrerCard } from "@/components/shared/xrd/scherrer-card";
import { XrdSimulateCard } from "@/components/shared/xrd/xrd-simulate-card";
import { VaspCard } from "@/components/shared/dft/vasp-card";
import type { ChartPanelPrefill, FlowPanelPrefill, PlotInsertReplay, PlotToolPrefill } from "@/contracts/figure";
import type { ChartRegistryField } from "@/contracts/chart-style";
import type { FigureDef, FigureRegistry } from "@/services/figures";
import type { PlotToolProps } from "@/components/shared/plot/plot-tool-props";

/** registry figure id → 专用面板（未列出的 xrd 图走默认 null） */
const XRD_PANELS: Record<
  string,
  (props: PlotToolProps & { projectId?: string; prefill?: PlotToolPrefill | null }) => ReactNode
> = {
  xrd_workflow: (props) => <XrdWorkflowCard key="xrd_workflow" {...props} />,
  xrd_peakfit: (props) => <PeakFitCard key="xrd_peakfit" {...props} />,
  xrd_unitcell: (props) => <UnitCellCard key="xrd_unitcell" {...props} />,
  xrd_amorphous: (props) => <AmorphousCard key="xrd_amorphous" {...props} />,
  xrd_bragg: (props) => <BraggCard key="xrd_bragg" {...props} />,
  xrd_xps: (props) => <XpsCard key="xrd_xps" {...props} />,
  xrd_stack: (props) => <StackCard key="xrd_stack" {...props} />,
  xrd_scherrer: (props) => <ScherrerCard key="xrd_scherrer" {...props} />,
  xrd_simulate: (props) => <XrdSimulateCard key="xrd_simulate" {...props} />,
};

const DFT_PANELS: Record<
  string,
  (props: PlotToolProps & { prefill?: PlotToolPrefill | null }) => ReactNode
> = {
  dft_vasp_dos: (props) => <VaspCard key="dft_vasp_dos" figureId="dft_vasp_dos" {...props} />,
  dft_vasp_band: (props) => <VaspCard key="dft_vasp_band" figureId="dft_vasp_band" {...props} />,
  dft_vasp_procar: (props) => (
    <VaspCard key="dft_vasp_procar" figureId="dft_vasp_procar" {...props} />
  ),
};

const DIAGRAM_PANELS: Record<
  string,
  (props: PlotToolProps & { prefill?: FlowPanelPrefill | PlotToolPrefill | null }) => ReactNode
> = {
  flow: (props) => <FlowCard key="flow" {...props} prefill={props.prefill as FlowPanelPrefill | null | undefined} />,
  mechanism: (props) => (
    <MermaidMechanismCard
      key="mechanism"
      {...props}
      prefill={props.prefill as PlotToolPrefill | null | undefined}
    />
  ),
  mechanism_panel: (props) => (
    <MechanismPanelCard
      key="mechanism_panel"
      {...props}
      prefill={props.prefill as PlotToolPrefill | null | undefined}
    />
  ),
  molecule: (props) => (
    <MolCard key="molecule" {...props} prefill={props.prefill as PlotToolPrefill | null | undefined} />
  ),
};

export interface PlotFigurePanelProps {
  figure: FigureDef;
  registry: FigureRegistry;
  projectId: string;
  toolProps: PlotToolProps;
  chartPrefill: ChartPanelPrefill | null;
  flowPrefill?: FlowPanelPrefill | null;
  toolPrefill?: PlotToolPrefill | null;
  onInsertToPaper: (imageUrl: string, caption: string, replay?: PlotInsertReplay) => void;
  onInsertTable?: (caption: string, html: string, statsText: string) => void;
}

/** 按 registry 条目渲染作图主内容区（替代 plot-page-client 内大 switch） */
export function PlotFigurePanel({
  figure,
  registry,
  projectId,
  toolProps,
  chartPrefill,
  flowPrefill,
  toolPrefill,
  onInsertToPaper,
  onInsertTable,
}: PlotFigurePanelProps) {
  if (figure.category === "dft") {
    const dftRender = DFT_PANELS[figure.id];
    if (dftRender) {
      const activeToolPrefill =
        toolPrefill && toolPrefill.figureId === figure.id ? toolPrefill : null;
      return dftRender({ ...toolProps, prefill: activeToolPrefill });
    }
    const activePrefill =
      chartPrefill && figure.id === chartPrefill.figureId ? chartPrefill : null;
    return (
      <ChartWorkspace
        key={`${figure.id}-${activePrefill ? "prefill" : "default"}`}
        projectId={projectId !== "default" ? projectId : undefined}
        onInsertToPaper={onInsertToPaper}
        registryEntry={figure}
        globalStyleFields={registry.global_style_fields as ChartRegistryField[] | undefined}
        prefill={activePrefill}
      />
    );
  }

  if (figure.category === "chart") {
    const activePrefill =
      chartPrefill && figure.id === chartPrefill.figureId ? chartPrefill : null;
    return (
      <ChartWorkspace
        key={`${figure.id}-${activePrefill ? "prefill" : "default"}`}
        projectId={projectId !== "default" ? projectId : undefined}
        onInsertToPaper={onInsertToPaper}
        registryEntry={figure}
        globalStyleFields={registry.global_style_fields as ChartRegistryField[] | undefined}
        prefill={activePrefill}
      />
    );
  }

  if (figure.category === "table") {
    return <TablePanel key={figure.id} {...toolProps} onInsertTable={onInsertTable} />;
  }

  const diagramRender = DIAGRAM_PANELS[figure.id];
  if (diagramRender) {
    const activeToolPrefill =
      toolPrefill && toolPrefill.figureId === figure.id ? toolPrefill : null;
    return diagramRender({
      ...toolProps,
      prefill:
        figure.id === "flow"
          ? (flowPrefill ?? activeToolPrefill)
          : activeToolPrefill,
    });
  }

  if (figure.category === "xrd") {
    const xrdRender = XRD_PANELS[figure.id];
    if (xrdRender) {
      const activeToolPrefill =
        toolPrefill && toolPrefill.figureId === figure.id ? toolPrefill : null;
      return xrdRender({ ...toolProps, projectId, prefill: activeToolPrefill });
    }
  }

  return null;
}
