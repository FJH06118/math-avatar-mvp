import { InteractiveProjectHome } from "./interactive-project-home";
import { ProjectList } from "./project-list";

export function ProjectHome() {
  return (
    <InteractiveProjectHome
      recentProjects={<ProjectList variant="stage" />}
    />
  );
}
