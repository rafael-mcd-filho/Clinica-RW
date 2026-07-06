import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { Providers } from "./providers";
import { getPlatformSettings } from "@/lib/platform/settings";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettings();
  const icon = settings.logo_url ?? "/favicon.ico";

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
    <html lang="pt-BR" className={`${plexSans.variable} h-full antialiased`}>
      <body
        className="min-h-full"
        style={
          {
            "--primary": settings.primary_color,
          } as CSSProperties
        }
      >
        <Providers>{children}</Providers>
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
