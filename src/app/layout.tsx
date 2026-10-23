import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font (no runtime request to Google).
const serif = Noto_Serif_TC({
  weight: ["700", "900"],
  display: "swap",
  preload: false,
  variable: "--font-serif-tc",
});
const mono = IBM_Plex_Mono({
  weight: ["500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "NEWS ATLAS 海港市事件地圖（虛構範例）",
  description: "十九格六邊形拼成一座虛構城市：一格一個主題，一格一串新聞事件。所有內容皆為虛構範例資料。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#262a33",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" className={`${serif.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
