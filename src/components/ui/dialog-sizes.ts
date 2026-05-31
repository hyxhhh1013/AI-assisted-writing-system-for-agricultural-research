/** 覆盖 Dialog 默认 sm:max-w-sm，全站二级窗统一尺寸 token */

/** 表单类弹窗：上传、批量移动、简单编辑 */
export const DIALOG_FORM =
  "w-[calc(100vw-2rem)] sm:max-w-xl md:max-w-2xl";

/** 工作区弹窗：元数据编辑、一致性检查等中等复杂面板 */
export const DIALOG_WORK =
  "w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0";

/** 全屏预览/大型面板：PDF 预览、项目设置等 */
export const DIALOG_FULL =
  "w-[calc(100vw-2rem)] sm:max-w-6xl h-[92vh] max-h-[92vh] overflow-hidden flex flex-col p-0";
