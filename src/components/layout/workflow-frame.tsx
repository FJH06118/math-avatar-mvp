import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CourseProgress } from "./course-progress";
import { PageContainer } from "./page-container";

interface WorkflowFrameProps {
  currentStep: number;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function WorkflowFrame({
  currentStep,
  title,
  description,
  backHref,
  backLabel,
  status,
  actions,
  children,
}: WorkflowFrameProps) {
  return (
    <PageContainer
      size="wide"
      className="flex flex-1 py-4 sm:py-6 lg:py-8"
    >
      <section className="product-surface stage-enter my-auto flex w-full flex-col overflow-hidden rounded-lg">
        <div className="flex flex-col gap-6 border-b border-foreground/12 bg-card px-5 py-5 sm:px-8 sm:py-7 lg:px-10">
          <Link
            href={backHref}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "-ml-3 self-start",
            )}
          >
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            {backLabel}
          </Link>

          <CourseProgress current={currentStep} />

          <header className="flex flex-col justify-between gap-4 pt-1 lg:flex-row lg:items-end">
            <div className="flex max-w-3xl flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-primary">
                  第 {currentStep + 1} 步，共 5 步
                </p>
                {status}
              </div>
              <h1 className="text-balance text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                {title}
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-sm">
                {description}
              </p>
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">
                {actions}
              </div>
            ) : null}
          </header>
        </div>
        <div className="min-w-0 p-5 sm:p-8 lg:p-10">{children}</div>
      </section>
    </PageContainer>
  );
}
