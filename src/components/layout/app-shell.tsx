import { TopNavigation } from "./top-navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="isolate flex min-h-dvh flex-col overflow-x-hidden bg-background">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm focus:translate-y-0 focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        跳到主要内容
      </a>
      <TopNavigation />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col"
      >
        {children}
      </main>
    </div>
  );
}
