import type { PlotInsertReplay } from "@/contracts/figure";
import type { PreviewImage } from "@/components/shared/xrd/image-preview-dialog";

export interface PlotToolProps {
  title?: string;
  description?: string;
  onInsertToPaper: (imageUrl: string, caption: string, replay?: PlotInsertReplay) => void;
  /** 三线表等无图片内容插入章节 */
  onInsertTable?: (caption: string, html: string, statsText: string) => void;
  onPreview?: (img: PreviewImage | null) => void;
}