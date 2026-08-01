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
  searchParams: Promise<{ jobId?: string }>;
}) {
  const [{ projectId }, { jobId }] = await Promise.all([
    params,
    searchParams,
  ]);
  return <GenerationFlow projectId={projectId} initialJobId={jobId} />;
}
