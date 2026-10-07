export interface ShadowRebuildJob {
  category: string;
  fileCount: number;
  written: number;
  lastFile: string | null;
  finished: boolean;
  updatedAt: string;
}

export interface ShadowRebuildView {
  category: string;
  running: boolean;
  activeCategory: string | null;
  fileCount: number;
  written: number;
  lastFile: string | null;
  finished: boolean;
  files: string[];
}

export interface ShadowTextSample {
  page: number;
  keptOld: boolean;
  text: string;
}

export interface ShadowDocumentPreview {
  source: string;
  category: string;
  builtAt: string;
  chunkCount: number;
  keptOldChunks: number;
  crossColumnPages: number[];
  samples: ShadowTextSample[];
}
