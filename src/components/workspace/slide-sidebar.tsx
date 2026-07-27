import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
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
      className="flex min-w-0 flex-col gap-4 border-b border-sidebar-border bg-sidebar p-4 text-sidebar-foreground lg:border-r lg:border-b-0"
      aria-label="幻灯片列表"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold">幻灯片</h2>
        <span className="text-sm tabular-nums text-sidebar-foreground/60">
          {slides.length} 页
        </span>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:h-[calc(100dvh-18rem)] lg:min-h-[34rem] lg:overflow-y-auto lg:px-0 lg:pr-1">
        <div className="grid auto-cols-[12rem] grid-flow-col gap-2 lg:flex lg:flex-col lg:gap-1.5">
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
                variant="default"
                className={cn(
                  "items-start rounded-md border border-transparent p-2 text-left text-sidebar-foreground transition-[color,background-color,border-color] duration-150 hover:bg-sidebar-accent",
                  isActive &&
                    "border-sidebar-primary/35 bg-sidebar-accent ring-0",
                )}
              >
                <ItemMedia className="w-16 shrink-0">
                  <span
                    className="flex aspect-video w-full flex-col justify-between overflow-hidden rounded-sm border border-sidebar-border bg-card/95 p-1 text-foreground"
                    aria-hidden="true"
                  >
                    <span className="line-clamp-2 text-[0.38rem] leading-tight font-medium">
                      {slide.title}
                    </span>
                    <span className="truncate font-mono text-[0.32rem] text-primary">
                      {slide.formulas[0]?.latex ?? "高等数学"}
                    </span>
                  </span>
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <p className="text-xs tabular-nums text-sidebar-foreground/55">
                    第 {slide.index + 1} 页
                  </p>
                  <ItemTitle className="max-w-full">{slide.title}</ItemTitle>
                </ItemContent>
              </Item>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
