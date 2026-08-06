import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageTransition } from "@/components/layout/PageTransition";
import { ChatWidget } from "@/components/marketing/ChatWidget";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Navbar />
      <PageTransition>
        <main id="main-content" className="flex-1">
          {children}
        </main>
      </PageTransition>
      <Footer />
      <ChatWidget />
    </div>
  );
}
