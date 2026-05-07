export interface Annotation {
  id: string;
  text: string;
  note: string;
  color: "yellow" | "green" | "blue" | "pink";
  createdAt: number;
}

const STORAGE_PREFIX = "annotations_";

function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function getKey(filename: string): string {
  return STORAGE_PREFIX + hash(filename);
}

export function loadAnnotations(filename: string): Annotation[] {
  try {
    const raw = localStorage.getItem(getKey(filename));
    if (!raw) return [];
    return JSON.parse(raw) as Annotation[];
  } catch {
    return [];
  }
}

export function saveAnnotations(filename: string, annotations: Annotation[]): void {
  try {
    localStorage.setItem(getKey(filename), JSON.stringify(annotations));
  } catch {
    // quota exceeded or private mode
  }
}

export function addAnnotation(
  filename: string,
  annotation: Omit<Annotation, "id" | "createdAt">,
): Annotation {
  const existing = loadAnnotations(filename);
  const entry: Annotation = {
    ...annotation,
    id: Math.random().toString(36).slice(2, 10),
    createdAt: Date.now(),
  };
  existing.push(entry);
  saveAnnotations(filename, existing);
  return entry;
}

export function deleteAnnotation(filename: string, id: string): void {
  const existing = loadAnnotations(filename);
  saveAnnotations(filename, existing.filter(a => a.id !== id));
}

export function updateAnnotation(filename: string, id: string, updates: Partial<Annotation>): void {
  const existing = loadAnnotations(filename);
  const idx = existing.findIndex(a => a.id === id);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...updates };
    saveAnnotations(filename, existing);
  }
}

export const COLOR_CLASSES: Record<string, string> = {
  yellow: "bg-yellow-200/70 border-b-2 border-yellow-400",
  green: "bg-green-200/70 border-b-2 border-green-400",
  blue: "bg-blue-200/70 border-b-2 border-blue-400",
  pink: "bg-pink-200/70 border-b-2 border-pink-400",
};
