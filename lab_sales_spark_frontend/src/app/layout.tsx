import type { Metadata } from "next";
import "./globals.css";
import { TitleBar } from "../components/TitleBar";

export const metadata: Metadata = {
  title: "HomeSpark | 専属秘書ジェニー",
  description: "次世代型AI秘書・音声リアルタイム対話プラットフォーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <TitleBar />
        {children}
      </body>
    </html>
  );
}

