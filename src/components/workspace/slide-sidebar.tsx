import { PresentationIcon } from "lucide-react";

import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ParsedSlide } from "@/types";

interface SlideSidebarProps {
  slides: ParsedSlide[];
  selectedSlideId: string;
  onSelect: (slideId: string) => void;
}

export function SlideSidebar({
  slides,
  selectedSlideId,
  onSelect,
}: SlideSidebarProps) {
  return (
    <aside
      className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-3"
      aria-label="幻灯片列表"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold">幻灯片</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {slides.length} 页
        </span>
      </div>
      <ScrollArea className="h-72 pr-2 xl:h-[calc(100dvh-19rem)] xl:min-h-[28rem]">
        <div className="flex flex-col gap-2">
          {slides.map((slide) => {
            const isActive = slide.id === selectedSlideId;
            return (
              <Item
                key={slide.id}
                render={
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onSelect(slide.id)}
                  />
                }
                variant={isActive ? "muted" : "default"}
                className={cn(
                  "items-start p-2 text-left",
                  isActive && "ring-1 ring-primary/30",
                )}
              >
                <ItemMedia className="w-14 shrink-0">
                  <span className="flex aspect-video w-full items-center justify-center rounded-md border bg-background text-muted-foreground">
                    <PresentationIcon aria-hidden="true" className="size-4" />
                  </span>
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <p className="text-xs tabular-nums text-muted-foreground">
                    第 {slide.index + 1} 页
                  </p>
                  <ItemTitle className="max-w-full">{slide.title}</ItemTitle>
                </ItemContent>
              </Item>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
