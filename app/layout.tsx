import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Weather Melody Agent",
  description: "语音音乐推荐 Agent Demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
