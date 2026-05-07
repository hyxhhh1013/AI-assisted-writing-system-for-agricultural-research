/** XRD API 类型定义与服务封装 */

// ===== 通用类型 =====

export interface XrdApiResponse<T = unknown> {
  imageBase64: string;
  imageUrl: string;
  data: T;
}

export interface XrdError {
  error: string;
}

// ===== 峰分解 =====

export interface PeakInfo {
  two_theta: number;
  intensity: number;
  relative_intensity: number;
}

export interface BgParams {
  LFctg?: number;
  window_length?: number;
  polyorder?: number;
  bac_split?: number;
  bac_var_type?: "constant" | "polynomial" | "multivariate gaussian";
}

export interface PeakFitConfig {
  title?: string;
  phase_label?: string;
  bg_params?: BgParams;
  peak_params?: {
    prominence?: number;
    min_height?: number;
    max_peaks?: number;
  };
}

export interface PeakFitData {
  n_peaks: number;
  peaks: PeakInfo[];
  bg_std_dev: number | null;
  bg_params: Record<string, unknown>;
}

export async function runPeakFit(
  dataFile: File,
  config: PeakFitConfig,
  signal?: AbortSignal,
): Promise<XrdApiResponse<PeakFitData>> {
  const fd = new FormData();
  fd.append("dataFile", dataFile);
  fd.append("config", JSON.stringify(config));
  const res = await fetch("/api/xrd/peakfit", { method: "POST", body: fd, signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "分析失败");
  return json;
}

// ===== 背景扣除 =====

export type BackgroundConfig = PeakFitConfig;

export type BackgroundData = PeakFitData;

export async function runBackgroundSubtraction(
  dataFile: File,
  config: BackgroundConfig,
  signal?: AbortSignal,
): Promise<XrdApiResponse<BackgroundData>> {
  const fd = new FormData();
  fd.append("dataFile", dataFile);
  fd.append("config", JSON.stringify(config));
  const res = await fetch("/api/xrd/peakfit", { method: "POST", body: fd, signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "背景扣除失败");
  return json;
}

// ===== 晶胞可视化 =====

export interface LatticeParams {
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
}

export interface UnitCellData {
  lattice: LatticeParams;
  n_atoms: number;
  space_group: string;
  crystal_symbol: string;
}

export interface UnitCellConfig {
  title?: string;
  elevation?: number;
  azimuth?: number;
}

export async function runUnitCell(
  cifFile: File,
  config?: UnitCellConfig,
  signal?: AbortSignal,
): Promise<XrdApiResponse<UnitCellData>> {
  const fd = new FormData();
  fd.append("cifFile", cifFile);
  fd.append("config", JSON.stringify(config || {}));
  const res = await fetch("/api/xrd/unitcell", { method: "POST", body: fd, signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "晶胞可视化失败");
  return json;
}

// ===== 非晶态分析 =====

export interface AmorphousComponent {
  weight: number;
  mu_2theta: number;
  sigma2: number;
}

export interface AmorphousData {
  n_components: number;
  components: AmorphousComponent[];
  rp_factor: number | null;
  interatomic_distance: number | null;
}

export interface AmorphousConfig {
  title?: string;
  mix_component?: number;
  sigma2_coef?: number;
  max_iter?: number;
  ang_range?: [number, number] | null;
  peak_location?: number[] | null;
  wavelength?: number;
}

export async function runAmorphousAnalysis(
  dataFile: File,
  config: AmorphousConfig,
  signal?: AbortSignal,
): Promise<XrdApiResponse<AmorphousData>> {
  const fd = new FormData();
  fd.append("dataFile", dataFile);
  fd.append("config", JSON.stringify(config));
  const res = await fetch("/api/xrd/amorphous", { method: "POST", body: fd, signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "非晶态分析失败");
  return json;
}

// ===== 布拉格优化 =====

export interface BraggLattice {
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
}

export interface BraggData {
  crystal_system: string;
  lattice_initial: BraggLattice;
  lattice_optimized: BraggLattice;
  n_peaks: number;
  rms_init: number;
  rms_opt: number;
  improvement_pct: number;
}

export interface BraggConfig {
  crystal_system: number;
  lattice_init: [number, number, number, number, number, number];
  hkl: [number, number, number][];
  exp_angles: number[];
  wavelength?: number;
  title?: string;
  subset_number?: number;
  low_bound?: number;
  up_bound?: number;
  tao?: number;
}

export async function runBraggOptimization(
  config: BraggConfig,
  signal?: AbortSignal,
): Promise<XrdApiResponse<BraggData>> {
  const res = await fetch("/api/xrd/bragg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    signal,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "布拉格优化失败");
  return json;
}

// ===== XRD 模拟 =====

export interface SimPeak {
  two_theta: number;
  hkl: number[];
  mult: number;
}

export interface SimulateData {
  n_peaks: number;
  peaks: SimPeak[];
  n_data_points: number;
  lattice: LatticeParams;
  crystal_system: number;
}

export interface SimulateConfig {
  title?: string;
  wavelength?: string;
  two_theta_range?: [number, number, number];
  grain_size?: number | null;
  super_cell?: boolean;
  periodic_arr?: [number, number, number];
  zero_shift?: number | null;
  thermo_vib?: number | null;
  orientation?: [number, number] | null;
  background?: boolean;
}

export async function runSimulation(
  cifFile: File,
  config: SimulateConfig,
  signal?: AbortSignal,
): Promise<XrdApiResponse<SimulateData>> {
  const fd = new FormData();
  fd.append("cifFile", cifFile);
  fd.append("config", JSON.stringify(config));
  const res = await fetch("/api/xrd/simulate", { method: "POST", body: fd, signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "XRD 模拟失败");
  return json;
}

// ===== XPS 分析 =====

export interface XpsComponent {
  weight: number;
  asymmetry: number;
  mu: number;
  gamma: number;
  sigma2: number;
  fwhm: number;
}

export interface XpsData {
  n_components: number;
  components: XpsComponent[];
  rp: number | null;
  rwp: number | null;
  rsquare: number | null;
  iterations: number;
  exit_flag: number;
}

export interface XpsConfig {
  title?: string;
  atom_identifiers: [string, string, number][];
  satellite_peaks?: [string, string, number][];
  energy_range?: [number, number] | null;
  bg_params?: BgParams;
  iter_max?: number;
}

export async function runXpsAnalysis(
  dataFile: File,
  config: XpsConfig,
  signal?: AbortSignal,
): Promise<XrdApiResponse<XpsData>> {
  const fd = new FormData();
  fd.append("dataFile", dataFile);
  fd.append("config", JSON.stringify(config));
  const res = await fetch("/api/xrd/xps", { method: "POST", body: fd, signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "XPS 分析失败");
  return json;
}
