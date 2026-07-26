import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/layout/app-shell";

import "./globals.css";
import { AppProviders } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "智数讲堂",
    template: "%s｜智数讲堂",
  },
  description: "使用数字人把高等数学课件转化为自然、清晰的授课视频。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
