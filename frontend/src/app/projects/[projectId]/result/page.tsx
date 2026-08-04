import type { Metadata } from "next";

import { ResultPage } from "@/components/result/result-page";

export const metadata: Metadata = {
  title: "授课视频结果",
};

export default async function VideoResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ jobId?: string }>;
}) {
  const [{ projectId }, { jobId }] = await Promise.all([params, searchParams]);
  return <ResultPage projectId={projectId} taskId={jobId} />;
}
