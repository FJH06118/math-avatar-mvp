import { BookOpenTextIcon, Clock3Icon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PageContainer } from "./page-container";

export function TopNavigation() {
  return (
    <header className="border-b bg-background">
      <PageContainer className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="返回智数讲堂首页"
          className="flex min-w-0 items-center gap-3 rounded-md outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpenTextIcon aria-hidden="true" className="size-5" />
          </span>
          <span className="truncate text-base font-semibold tracking-tight">
            智数讲堂
          </span>
        </Link>
        <Link
          href="/#recent-projects"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <Clock3Icon data-icon="inline-start" aria-hidden="true" />
          最近项目
        </Link>
      </PageContainer>
    </header>
  );
}
