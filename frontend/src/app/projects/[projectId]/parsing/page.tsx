import type { Metadata } from "next";

import { ParsingFlow } from "@/components/parsing/parsing-flow";

export const metadata: Metadata = {
  title: "解析课件",
};

interface ParsingPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ jobId?: string }>;
}

export default async function ParsingPage({
  params,
  searchParams,
}: ParsingPageProps) {
  const [{ projectId }, { jobId }] = await Promise.all([params, searchParams]);
  return <ParsingFlow projectId={projectId} initialJobId={jobId} />;
}
