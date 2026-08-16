import type { Metadata } from "next";

import { GenerationFlow } from "@/components/generation/generation-flow";

export const metadata: Metadata = {
  title: "生成授课视频",
};

export default async function VideoGenerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ jobId?: string; audioTaskId?: string; renderTaskId?: string }>;
}) {
  const [{ projectId }, { jobId, audioTaskId, renderTaskId }] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <GenerationFlow
      projectId={projectId}
      initialJobId={jobId}
      initialAudioTaskId={audioTaskId}
      initialRenderTaskId={renderTaskId}
    />
  );
}
