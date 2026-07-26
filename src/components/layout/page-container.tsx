import { cn } from "@/lib/utils";

interface PageContainerProps extends React.ComponentProps<"div"> {
  size?: "default" | "wide";
}

export function PageContainer({
  className,
  size = "default",
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        size === "wide" ? "max-w-[1600px]" : "max-w-6xl",
        className,
      )}
      {...props}
    />
  );
}
