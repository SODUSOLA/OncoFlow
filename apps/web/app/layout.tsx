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
  // iOS ignores the manifest's start_url for home-screen bookmarks, so these tags make the bookmark open full-screen.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OncoFlow",
  },
};

export const viewport: Viewport = {
  themeColor: "#002147",
};

// Root layout with fonts and metadata.
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
