import type { CSSProperties } from "react";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter, Quicksand } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { PerformanceMonitor } from "@/components/observability/performance-monitor";
import { getPlatformSettings } from "@/lib/platform/settings";

const inter = Inter({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const quicksand = Quicksand({
  variable: "--font-display",
  weight: ["600", "700"],
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettings();
  const icon = settings.logo_url ?? "/default-favicon.ico";

  return {
    title: settings.app_name,
    description: "Operação clínica multiempresa",
    icons: {
      icon,
      shortcut: icon,
      apple: icon,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getPlatformSettings();

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${quicksand.variable} h-full antialiased`}
    >
      <body
        className="min-h-full"
        style={
          {
            "--primary": settings.primary_color,
          } as CSSProperties
        }
      >
        {children}
        <Suspense fallback={null}>
          <PerformanceMonitor />
        </Suspense>
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ duration: 4000 }}
        />
      </body>
    </html>
  );
}
