import type { AppModule } from "@/contracts/modules";

/**
 * 功能开关：通过环境变量 NEXT_PUBLIC_ENABLE_* 控制功能可见性。
 * 默认全部开启，设为 "false" 即关闭，无需改代码。
 */
type FlagValue = boolean;

const enabledRef: Record<string, FlagValue> = {};

function isEnabled(key: string): boolean {
  if (!(key in enabledRef)) {
    const raw = process.env[`NEXT_PUBLIC_ENABLE_${key}`];
    enabledRef[key] = raw !== "false";
  }
  return enabledRef[key];
}

export const featureFlags = {
  get writing() { return isEnabled("WRITING"); },
  get outline() { return isEnabled("OUTLINE"); },
  get analysis() { return isEnabled("ANALYSIS"); },
  get translate() { return isEnabled("TRANSLATE"); },
  get plagiarism() { return isEnabled("PLAGIARISM"); },
  get chart() { return isEnabled("CHART"); },
  get knowledge() { return isEnabled("KNOWLEDGE"); },
  get consistency() { return isEnabled("CONSISTENCY"); },
  get xrd() { return isEnabled("XRD"); },
  get pdf() { return isEnabled("PDF"); },
  get experimentalDataInjection() { return isEnabled("EXPERIMENTAL_DATA_INJECTION"); },
  get review() { return isEnabled("REVIEW"); },
  /** 返回所有当前开启的功能 */
  all(): Record<string, FlagValue> {
    return {
      writing: this.writing,
      outline: this.outline,
      analysis: this.analysis,
      translate: this.translate,
      plagiarism: this.plagiarism,
      chart: this.chart,
      knowledge: this.knowledge,
      consistency: this.consistency,
      xrd: this.xrd,
      pdf: this.pdf,
      experimentalDataInjection: this.experimentalDataInjection,
      review: this.review,
    };
  },
};

/** 模块是否应展示（无 flag 的模块始终开启） */
export function isModuleEnabled(module: Pick<AppModule, "flag">): boolean {
  if (module.flag === null) return true;
  return isEnabled(module.flag);
}
