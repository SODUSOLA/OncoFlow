import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://oncoflow.health"),
  title: {
    default: "OncoFlow — Secure Oncology Care navigation",
    template: "%s | OncoFlow",
  },
  description:
    "OncoFlow is a secure, role-based oncology care navigation platform that manages the full patient journey — from scheduling through chemotherapy administration and follow-up.",
  openGraph: {
    title: "OncoFlow — Secure Oncology Care navigation",
    description:
      "A secure, role-based platform that coordinates the full cancer care journey across hospitals, clinicians, and patients.",
    siteName: "OncoFlow",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OncoFlow — Secure Oncology Care navigation",
    description:
      "A secure, role-based platform that coordinates the full cancer care journey across hospitals, clinicians, and patients.",
  },
  // iOS doesn't read the web manifest's start_url for "Add to Home Screen" bookmarks — it
  // launches whatever URL was open when the user tapped Add to Home Screen. These tags make
  // that bookmark open full-screen (no Safari chrome) instead of as a regular browser tab.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OncoFlow",
  },
};

export const viewport: Viewport = {
  themeColor: "#002147",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans text-neutral-900">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
