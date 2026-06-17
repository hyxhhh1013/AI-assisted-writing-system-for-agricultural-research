import type { PlotInsertReplay } from "@/contracts/figure";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

export interface PlotToolProps {
  title?: string;
  description?: string;
  onInsertToPaper: (imageUrl: string, caption: string, replay?: PlotInsertReplay) => void;
  onPreview?: (img: PreviewImage | null) => void;
}
