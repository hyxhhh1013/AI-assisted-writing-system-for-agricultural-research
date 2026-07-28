/** DFT / VASP 出图服务 */

export interface DftApiResponse<T = unknown> {
  imageBase64: string;
  imageUrl: string;
  data: T;
}

export interface VaspDosData {
  efermi?: number;
  nedos?: number;
  n_ions_partial?: number;
}

export interface VaspBandData {
  efermi?: number | null;
  nkpts?: number;
  nbands?: number;
  ispin?: number;
}

export interface VaspProcarData {
  efermi?: number | null;
  nkpts?: number;
  nbands?: number;
  nions?: number;
  project_orbitals?: string;
}

export interface VaspPlotConfig {
  title?: string;
  fermi_energy?: number | string;
  symmetry_points?: string;
  orientation?: "vertical" | "horizontal";
  shift_to_fermi?: boolean;
  fill?: boolean;
  project_orbitals?: string;
  ion_indices?: string;
  fat_scale?: number | string;
}

export async function runVaspDos(
  doscar: File,
  config: VaspPlotConfig = {},
  signal?: AbortSignal,
): Promise<DftApiResponse<VaspDosData>> {
  const fd = new FormData();
  fd.append("kind", "dos");
  fd.append("doscar", doscar);
  fd.append("config", JSON.stringify(config));
  const res = await fetch("/api/dft/vasp", { method: "POST", body: fd, signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "DOSCAR 解析失败");
  return json;
}

export async function runVaspBand(
  eigenval: File,
  options: {
    doscar?: File | null;
    outcar?: File | null;
    config?: VaspPlotConfig;
  } = {},
  signal?: AbortSignal,
): Promise<DftApiResponse<VaspBandData>> {
  const fd = new FormData();
  fd.append("kind", "band");
  fd.append("eigenval", eigenval);
  if (options.doscar) fd.append("doscar", options.doscar);
  if (options.outcar) fd.append("outcar", options.outcar);
  fd.append("config", JSON.stringify(options.config ?? {}));
  const res = await fetch("/api/dft/vasp", { method: "POST", body: fd, signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "EIGENVAL 解析失败");
  return json;
}

export async function runVaspProcar(
  procar: File,
  options: {
    doscar?: File | null;
    outcar?: File | null;
    config?: VaspPlotConfig;
  } = {},
  signal?: AbortSignal,
): Promise<DftApiResponse<VaspProcarData>> {
  const fd = new FormData();
  fd.append("kind", "procar");
  fd.append("procar", procar);
  if (options.doscar) fd.append("doscar", options.doscar);
  if (options.outcar) fd.append("outcar", options.outcar);
  fd.append("config", JSON.stringify(options.config ?? {}));
  const res = await fetch("/api/dft/vasp", { method: "POST", body: fd, signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "PROCAR 解析失败");
  return json;
}
