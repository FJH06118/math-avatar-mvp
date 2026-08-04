import {
  approveTracerLessonPlan,
  cancelTracerTask,
  createTracerAudioTask,
  createTracerCompositeTask,
  createTracerPlanTask,
  createTracerRenderTask,
  getTracerAudioTimeline,
  getTracerDelivery,
  getTracerFinalMedia,
  getTracerLessonPlans,
  getTracerRenderedPages,
  getTracerTask,
  reviseTracerLessonPlan,
  uploadTracerPresentation,
} from "./real-tracer";

export const tracerApiAdapter = {
  uploadPresentation: uploadTracerPresentation,
  getTask: getTracerTask,
  cancelTask: cancelTracerTask,
  createPlanTask: createTracerPlanTask,
  getLessonPlans: getTracerLessonPlans,
  reviseLessonPlan: reviseTracerLessonPlan,
  approveLessonPlan: approveTracerLessonPlan,
  createAudioTask: createTracerAudioTask,
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
