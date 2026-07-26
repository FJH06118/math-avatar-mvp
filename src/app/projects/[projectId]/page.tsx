import type { Metadata } from "next";

import { WorkspacePage } from "@/components/workspace/workspace-page";

export const metadata: Metadata = {
  title: "项目工作台",
};

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <WorkspacePage projectId={projectId} />;
}
