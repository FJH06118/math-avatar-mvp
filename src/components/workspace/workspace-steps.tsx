import { CourseProgress } from "@/components/layout/course-progress";

export function WorkspaceSteps({ current = 2 }: { current?: number }) {
  return <CourseProgress current={current} />;
}
