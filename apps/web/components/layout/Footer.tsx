import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/ui/Container";
import { LinkedinIcon, XIcon } from "@/components/ui/SocialIcons";
import { footerNav, legalNav, siteConfig } from "@/lib/site-config";

// Site footer.
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200 bg-primary text-white">
      <Container className="py-16 md:py-20">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          <div className="col-span-2">
            <Logo onDark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              {siteConfig.description}
            </p>
            <div className="mt-6 flex gap-3">
              <a
                href={siteConfig.social.linkedin}
                aria-label="OncoFlow on LinkedIn"
                className="inline-flex size-9 items-center justify-center rounded-xl bg-white/10 transition-colors duration-fast hover:bg-white/20"
              >
                <LinkedinIcon className="size-4" />
              </a>
              <a
                href={siteConfig.social.twitter}
                aria-label="OncoFlow on X (Twitter)"
                className="inline-flex size-9 items-center justify-center rounded-xl bg-white/10 transition-colors duration-fast hover:bg-white/20"
              >
                <XIcon className="size-4" />
              </a>
            </div>
          </div>

          {footerNav.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-white">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.items.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="text-sm text-white/70 transition-colors duration-fast hover:text-white"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-8 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-white/60">
            &copy; {year} {siteConfig.legalName}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {legalNav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-sm text-white/60 transition-colors duration-fast hover:text-white"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}
