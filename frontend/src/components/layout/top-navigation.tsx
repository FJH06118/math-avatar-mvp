"use client";

import { SettingsIcon, SigmaIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PageContainer } from "./page-container";

export function TopNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  function guardWorkspaceNavigation(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (document.documentElement.dataset.workspaceDirty !== "true") {
      return;
    }
    event.preventDefault();
    setPendingHref(href);
  }

  function leaveWorkspace() {
    const href = pendingHref;
    setPendingHref(null);
    if (href) {
      router.push(href);
    }
  }

  return (
    <>
      <header className="relative z-40 border-b border-foreground/12 bg-background/90 backdrop-blur-md">
        <PageContainer
          size="wide"
          className="flex h-16 items-center justify-between gap-4 sm:h-[4.25rem]"
        >
          <Link
            href="/"
            aria-label="返回课程首页"
            onClick={(event) => guardWorkspaceNavigation(event, "/")}
            className="group flex size-10 items-center justify-center rounded-md outline-none transition-[background-color,transform] duration-[160ms] ease-[var(--ease-out)] hover:bg-foreground/[0.05] active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <SigmaIcon
              aria-hidden="true"
              className="size-5 shrink-0 text-primary"
              strokeWidth={1.8}
            />
          </Link>
          {!isHome ? (
            <nav className="flex items-center gap-1" aria-label="主要导航">
              <Link
                href="/#recent-projects"
                onClick={(event) =>
                  guardWorkspaceNavigation(event, "/#recent-projects")
                }
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "hidden sm:inline-flex",
                )}
              >
                最近项目
              </Link>
              <Link
                href="/upload"
                onClick={(event) => guardWorkspaceNavigation(event, "/upload")}
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                )}
              >
                新建课程
              </Link>
              <Link
                href="/settings"
                aria-label="打开系统设置"
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
              >
                <SettingsIcon aria-hidden="true" />
              </Link>
            </nav>
          ) : null}
        </PageContainer>
      </header>

      <AlertDialog
        open={pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingHref(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>离开课程工作台？</AlertDialogTitle>
            <AlertDialogDescription>
              仍有讲稿或授课配置尚未保存。现在离开会丢失这些修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={leaveWorkspace}
            >
              放弃修改并离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
