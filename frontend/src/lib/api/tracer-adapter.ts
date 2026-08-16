import {
  approveTracerLessonPlan,
  cancelTracerTask,
  createTracerAudioTask,
  createTracerVoicePreviewTask,
  createTracerCompositeTask,
  createTracerWorkflow,
  getTracerWorkflow,
  cancelTracerWorkflow,
  retryTracerWorkflow,
  createTracerPlanTask,
  createTracerRenderTask,
  getTracerAudioTimeline,
  getTracerDelivery,
  getTracerFinalMedia,
  getTracerLessonPlans,
  getTracerParseSnapshot,
  getTracerWorkspace,
  getTracerRenderedPages,
  getTracerTask,
  retryTracerTask,
  reviseTracerLessonPlan,
  setTracerRevisionLocked,
  uploadTracerPresentation,
} from "./real-tracer";

export const tracerApiAdapter = {
  uploadPresentation: uploadTracerPresentation,
  getTask: getTracerTask,
  retryTask: retryTracerTask,
  getParseSnapshot: getTracerParseSnapshot,
  getWorkspace: getTracerWorkspace,
  cancelTask: cancelTracerTask,
  createPlanTask: createTracerPlanTask,
  getLessonPlans: getTracerLessonPlans,
  reviseLessonPlan: reviseTracerLessonPlan,
  setRevisionLocked: setTracerRevisionLocked,
  approveLessonPlan: approveTracerLessonPlan,
  createAudioTask: createTracerAudioTask,
  createVoicePreviewTask: createTracerVoicePreviewTask,
  getAudioTimeline: getTracerAudioTimeline,
  createRenderTask: createTracerRenderTask,
  getRenderedPages: getTracerRenderedPages,
  createCompositeTask: createTracerCompositeTask,
  getFinalMedia: getTracerFinalMedia,
  getDelivery: getTracerDelivery,
  createWorkflow: createTracerWorkflow,
  getWorkflow: getTracerWorkflow,
  cancelWorkflow: cancelTracerWorkflow,
  retryWorkflow: retryTracerWorkflow,
} as const;

export function isRealTracerApiMode(value = process.env.NEXT_PUBLIC_PPT_DH_API_MODE): boolean {
  const mode = value?.trim() || (process.env.NODE_ENV === "production" ? "production" : "mock");
  if (process.env.NODE_ENV === "production" && mode === "mock") {
    throw new Error("生产模式禁止使用 Mock API。请修正运行时模式后重启。" );
  }
  if (!['mock', 'stage-t', 'production'].includes(mode)) {
    throw new Error("API 模式配置无效。请使用 production 或 stage-t。" );
  }
  return mode !== "mock";
}

export function getEnabledTracerApiAdapter(value = process.env.NEXT_PUBLIC_PPT_DH_API_MODE) {
  return isRealTracerApiMode(value) ? tracerApiAdapter : null;
}
