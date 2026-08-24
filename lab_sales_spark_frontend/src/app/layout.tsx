import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sales Spark | Next-Gen Sales Platform",
  description: "Accelerate your sales insights and dashboard performance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

