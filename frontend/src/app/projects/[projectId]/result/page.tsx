import type { Metadata } from "next";

import { ResultPage } from "@/components/result/result-page";

export const metadata: Metadata = {
  title: "授课视频结果",
};

export default async function VideoResultPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ResultPage projectId={projectId} />;
}
