import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "目指せ合格！過去問くん",
  description: "ITパスポート・基本情報技術者試験の過去問学習アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
