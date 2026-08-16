import type { Metadata } from "next";

import { SetupWizard } from "@/components/settings/setup-wizard";

export const metadata: Metadata = { title: "首次启动设置" };

export default function SetupRoute() {
  return <SetupWizard />;
}
