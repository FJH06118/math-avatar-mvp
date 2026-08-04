import { SigmaIcon } from "lucide-react";
import Image from "next/image";

import type { Avatar, ParsedSlide } from "@/types";

interface SlidePreviewProps {
  slide: ParsedSlide;
  avatar?: Avatar;
  avatarPosition?: "left" | "right" | "hidden";
}

export function SlidePreview({
  slide,
  avatar,
  avatarPosition = "right",
}: SlidePreviewProps) {
  if (slide.originalPageUrl) {
    return (
      <div className="overflow-hidden border border-foreground/20 bg-secondary/65 p-4 sm:p-8">
        <div className="relative mx-auto aspect-video w-full max-w-3xl overflow-hidden bg-card shadow-[0_20px_50px_color-mix(in_oklch,var(--foreground)_14%,transparent)] ring-1 ring-foreground/10">
          <Image
            src={slide.originalPageUrl}
            alt={`第 ${slide.slideNumber} 页原页：${slide.title}`}
            width={1280}
            height={720}
            unoptimized
            className="size-full object-contain"
          />
          <AvatarPreview avatar={avatar} position={avatarPosition} />
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden border border-foreground/20 bg-secondary/65 p-4 sm:p-8">
      <div className="relative mx-auto aspect-video w-full max-w-3xl overflow-hidden bg-card p-5 shadow-[0_20px_50px_color-mix(in_oklch,var(--foreground)_14%,transparent)] ring-1 ring-foreground/10 sm:p-8">
        <div className="flex h-full flex-col justify-between gap-4">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-primary">
              高等数学 / 第 {slide.slideNumber} 页
            </p>
            <h2 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
              {slide.title}
            </h2>
            <p className="line-clamp-3 text-pretty text-base text-muted-foreground sm:text-sm">
              {slide.summary}
            </p>
          </div>
          {slide.formulas[0] ? (
            <div className="flex min-w-0 items-start gap-3 border-l-2 border-primary bg-secondary p-3 text-secondary-foreground">
              <SigmaIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
              />
              <p className="min-w-0 break-words font-mono text-sm">
                {slide.formulas[0].latex}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              本页用于概念讲解与例题分析。
            </p>
          )}
        </div>
        <AvatarPreview avatar={avatar} position={avatarPosition} />
      </div>
    </div>
  );
}

function AvatarPreview({
  avatar,
  position,
}: {
  avatar?: Avatar;
  position: "left" | "right" | "hidden";
}) {
  if (!avatar?.imageUrl || position === "hidden") {
    return null;
  }

  return (
    <div
      aria-label={`当前数字人画面：${avatar.name}`}
      className={`pointer-events-none absolute bottom-0 z-10 w-[24%] max-w-48 ${
        position === "left" ? "left-0" : "right-0"
      }`}
    >
      <Image
        src={avatar.imageUrl}
        alt={`${avatar.name}画面预览`}
        width={512}
        height={512}
        className="h-auto w-full object-contain object-bottom drop-shadow-[0_8px_14px_color-mix(in_oklch,var(--foreground)_18%,transparent)]"
      />
    </div>
  );
}
