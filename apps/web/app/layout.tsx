import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { cn } from "@/lib/utils";

/** Primary UI/body face. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Eyebrow labels, receipts, and mono data (costs, mileage). */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wrench",
  description: "Wrench is a car modification tracking and planning tool that helps you keep track of your car's modifications, plan future modifications, and get AI advice on your specific car.",
  metadataBase: new URL("https://wrench.it.com"),
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      {
        url: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Wrench",
    description: "Wrench is a car modification tracking and planning tool that helps you keep track of your car's modifications, plan future modifications, and get AI advice on your specific car.",
    url: "https://wrench.it.com",
    siteName: "Wrench",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Wrench",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wrench",
    description: "Wrench is a car modification tracking and planning tool that helps you keep track of your car's modifications, plan future modifications, and get AI advice on your specific car.",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", "dark", "font-sans", inter.variable, jetbrainsMono.variable)}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
