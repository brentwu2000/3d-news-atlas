import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3D 新聞地圖（虛構範例）",
  description: "以漂浮島嶼呈現新聞主題的互動 3D 地圖。目前使用虛構範例資料。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101b2b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body className="bg-atlas-backdrop text-[var(--ui-text)] antialiased">{children}</body>
    </html>
  );
}
