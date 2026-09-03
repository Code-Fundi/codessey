import type { Metadata, Viewport } from "next";
import { Syne, DM_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { WalletProvider } from "@/hooks/useWallet";
import "../styles.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const SITE_URL = "https://codessey.codefundi.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Codessey — Turn a codebase into a 3D landscape",
  description:
    "Index a GitHub repo with CodeFundi and explore it as a World Labs landscape. Powered by CodeFundi and World Labs.",
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/favicon/apple-touch-icon.png",
    other: [
      {
        rel: "icon",
        url: "/favicon/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        rel: "icon",
        url: "/favicon/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
  manifest: "/favicon/site.webmanifest",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Codessey",
    title: "Codessey — Turn a codebase into a 3D landscape",
    description: "Turn your codebase into a 3D landscape.",
    images: [
      {
        url: "/main-banner.png",
        width: 1200,
        height: 630,
        alt: "Codessey — Turn your codebase into a 3D landscape",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Codessey — Turn a codebase into a 3D landscape",
    description: "Turn your codebase into a 3D landscape.",
    images: ["/main-banner.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="antialiased">
        <WalletProvider>{children}</WalletProvider>
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}
