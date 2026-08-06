export const siteConfig = {
  name: "OncoFlow",
  legalName: "OncoFlow Limited",
  description:
    "Secure, role-based oncology care coordination — from scheduling through chemotherapy administration and follow-up.",
  contactEmail: "hello@oncoflow.health",
  supportEmail: "support@oncoflow.health",
  phone: "+234 (0) 800 000 0000",
  address: "Plot 14, Central Business District, Abuja, Nigeria",
  social: {
    linkedin: "https://www.linkedin.com/company/oncoflow",
    twitter: "https://twitter.com/oncoflowhq",
  },
};

export interface NavItem {
  label: string;
  href: string;
}

export const primaryNav: NavItem[] = [
  { label: "Solutions", href: "/solutions" },
  { label: "Features", href: "/features" },
  { label: "About", href: "/about" },
  { label: "Resources", href: "/resources" },
  { label: "Contact", href: "/contact" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Company",
    items: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Features", href: "/features" },
      { label: "Security & Privacy", href: "/features#security" },
      { label: "Login", href: "/login" },
      { label: "Register", href: "/register" },
    ],
  },
  {
    title: "Solutions",
    items: [
      { label: "Service Overview", href: "/solutions" },
      { label: "Hybrid Care Model", href: "/solutions#hybrid-model" },
      { label: "For Hospitals", href: "/contact" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Blog", href: "/resources#blog" },
      { label: "Research", href: "/resources#research" },
      { label: "Guides", href: "/resources#guides" },
    ],
  },
];

export const legalNav: NavItem[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Cookie Policy", href: "/cookies" },
];
