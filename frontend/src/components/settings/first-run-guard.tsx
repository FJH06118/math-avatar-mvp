"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { getApplicationSettings } from "@/lib/api/provider-client";
import { getEnabledTracerApiAdapter } from "@/lib/api/tracer-adapter";

export function FirstRunGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const realMode = Boolean(getEnabledTracerApiAdapter());
  const settingsQuery = useQuery({
    queryKey: ["first-run-application-settings"],
    queryFn: ({ signal }) => getApplicationSettings(signal),
    enabled: realMode && pathname !== "/setup" && pathname !== "/settings",
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (settingsQuery.data && settingsQuery.data.providers.length === 0 && pathname !== "/setup" && pathname !== "/settings") {
      router.replace("/setup");
    }
  }, [pathname, router, settingsQuery.data]);

  return null;
}
