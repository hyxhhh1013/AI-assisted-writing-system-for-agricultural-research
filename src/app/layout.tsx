import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { SiteShell } from "@/components/layout/site-shell";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "禾书耕文 | GrainScript - 农业科研 AI 辅助写作系统",
  description: "基于 RAG 技术的实验室专属农业论文辅助平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="antialiased">
      <body className="min-h-screen font-sans">
        <AuthProvider>
          <SiteShell>{children}</SiteShell>
        </AuthProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
