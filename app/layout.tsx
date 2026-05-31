import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SessionProvider } from 'next-auth/react'
import { ScrollHideProvider } from '@/lib/scroll-hide-context'
import PostHogProvider from '@/components/PostHogProvider'
import "./globals.css";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
}

export const metadata: Metadata = {
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
  manifest: '/manifest.webmanifest',
  title: "Долгое наступление",
  description: "Читательские круги — записывайтесь на совместное чтение и обсуждение книг",
  openGraph: {
    title: "Долгое наступление",
    description: "Читательские круги — записывайтесь на совместное чтение и обсуждение книг",
    url: "https://www.slowreading.club",
    siteName: "Долгое наступление",
    locale: "ru_RU",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Долгое наступление",
    description: "Читательские круги — записывайтесь на совместное чтение и обсуждение книг",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">
        <SessionProvider>
          <PostHogProvider>
            <ScrollHideProvider>
              {children}
            </ScrollHideProvider>
          </PostHogProvider>
        </SessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
