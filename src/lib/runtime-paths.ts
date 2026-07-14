import path from "path";

export function getProjectRuntimeRoot(): string {
  return /* turbopackIgnore: true */ process.cwd();
}

export function resolveProjectRuntimePath(...segments: string[]): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), ...segments);
}
