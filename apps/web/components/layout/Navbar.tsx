"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { AnimatedLink } from "@/components/ui/AnimatedLink";
import { Container } from "@/components/ui/Container";
import { primaryNav } from "@/lib/site-config";
import { cn } from "@/lib/utils";

// Site navigation bar with a mobile menu.
export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Closes the mobile menu.
  const closeMobileMenu = () => setMobileOpen(false);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-surface/90 backdrop-blur-sm">
      <Container className="flex h-18 items-center justify-between py-3">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
          {primaryNav.map((item) => (
            <AnimatedLink
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm font-medium text-neutral-700 transition-colors duration-fast ease-out hover:text-primary",
                pathname === item.href && "text-primary"
              )}
            >
              {item.label}
            </AnimatedLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button href="/login" variant="ghost" size="sm">
            Login
          </Button>
          <Button href="/register" variant="primary" size="sm">
            Register
          </Button>
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen((v) => !v)}
          className="inline-flex size-10 items-center justify-center rounded-xl text-primary transition-colors duration-fast hover:bg-primary-50 lg:hidden"
        >
          {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </Container>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 top-18 z-40 bg-black/20 lg:hidden"
              onClick={closeMobileMenu}
              aria-hidden="true"
            />
            <motion.div
              id="mobile-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 top-18 z-40 max-h-[calc(100vh-4.5rem)] overflow-y-auto border-b border-neutral-200 bg-surface shadow-xl lg:hidden"
            >
              <Container className="flex flex-col gap-1 py-6">
                {primaryNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className="rounded-xl px-4 py-3 text-base font-medium text-neutral-800 transition-colors duration-fast hover:bg-primary-50 hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="mt-4 flex flex-col gap-3 border-t border-neutral-200 pt-4">
                  <Button href="/login" variant="outline" size="md" onClick={closeMobileMenu}>
                    Login
                  </Button>
                  <Button href="/register" variant="primary" size="md" onClick={closeMobileMenu}>
                    Register
                  </Button>
                </div>
              </Container>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
