import {
  approveTracerLessonPlan,
  cancelTracerTask,
  createTracerAudioTask,
  createTracerVoicePreviewTask,
  createTracerCompositeTask,
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
  reviseTracerLessonPlan,
  setTracerRevisionLocked,
  uploadTracerPresentation,
} from "./real-tracer";

export const tracerApiAdapter = {
  uploadPresentation: uploadTracerPresentation,
  getTask: getTracerTask,
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
} as const;

export function getEnabledTracerApiAdapter(value = process.env.NEXT_PUBLIC_PPT_DH_API_MODE) {
  return value === "stage-t" ? tracerApiAdapter : null;
}
