"use client";

import Link from "next/link";

type FooterColumn = {
  title: string;
  links: { label: string; href: string }[];
  footerCta?: { label: string; href: string };
};

const footerColumns: FooterColumn[] = [
  {
    title: "Products",
    links: [
      { label: "VPS", href: "/products/vps" },
      { label: "Cloud VPS", href: "/products/cloud-vps" },
      { label: "Dedicated Cloud", href: "/products/dedicated-cloud" },
      { label: "GPU Cloud", href: "/products/gpu-cloud" },
      { label: "Private Cloud", href: "/products/private-cloud" },
      { label: "S3 Storage", href: "/products/s3-storage" },
      { label: "Backup Storage", href: "/products/backup-storage" },
      { label: "Web Hosting", href: "/products/web-hosting" },
      { label: "Managed Ops", href: "/products/managed-ops" },
    ],
    footerCta: { label: "View all products →", href: "/products" },
  },
  {
    title: "CloudLabs",
    links: [
      { label: "Hands-on Labs", href: "/cloudlabs#labs" },
      { label: "Cloud Sandboxes", href: "/cloudlabs#sandboxes" },
      { label: "Workspaces", href: "/cloudlabs#workspaces" },
      { label: "Demo/POC", href: "/cloudlabs#demos" },
      { label: "Events & Hackathons", href: "/cloudlabs#events" },
      { label: "LMS Integration", href: "/cloudlabs#lms" },
    ],
    footerCta: { label: "Discover Racko Products →", href: "/products" },
  },
  {
    title: "Industries",
    links: [
      { label: "EdTech", href: "/industries/edtech" },
      { label: "AI-Native Startups", href: "/industries/ai-startups" },
      { label: "BPO / KPO", href: "/industries/bpo-kpo" },
      { label: "Manufacturing", href: "/industries/manufacturing" },
      { label: "Healthcare", href: "/industries/healthcare" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Footprint", href: "/platform#footprint" },
      { label: "Workload Placement", href: "/platform#placement" },
      { label: "Security", href: "/platform#security" },
      { label: "Observability", href: "/platform#observability" },
      { label: "Managed Ops", href: "/platform#managed-ops" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Racko", href: "/company/about" },
      { label: "Ecosystem Partners", href: "/company/partners" },
      { label: "Contact", href: "/company/contact" },
    ],
  },
];

const socialItems = ["in", "tw", "gh"];

export default function Footer() {
  return (
    <footer className="border-t border-[rgba(255,255,255,0.08)] bg-bg-900 pb-10 pt-20">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="grid min-w-0 gap-10 md:grid-cols-2 lg:grid-cols-[220px_repeat(5,minmax(0,1fr))]">
          <div className="min-w-0">
            <Link href="/" className="inline-flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Racko"
                fetchPriority="high"
                width="160"
                height="42"
                decoding="async"
                data-nimg="1"
                className="h-10 w-auto"
                src="/images/racko-logo.png"
                style={{ color: "transparent" }}
              />
            </Link>

            <p className="mt-5 text-[13px] leading-[1.8] text-text-muted">
              Enterprise infrastructure designed around the workload - not
              around a single cloud ideology. Private, hybrid, and AI-ready,
              governed and managed for production scale.
            </p>

            <div className="mt-5 flex items-center gap-2.5">
              {socialItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[rgba(255,255,255,0.15)] text-xs text-text-muted transition-colors duration-200 ease-out hover:border-[rgba(255,255,255,0.15)] hover:bg-bg-700 hover:text-white"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title} className="min-w-0">
              <p className="mb-5 font-sans text-xs font-bold uppercase tracking-[0.06em] text-white">
                {column.title}
              </p>
              <ul className="space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-text-muted no-underline transition-colors duration-300 ease-out hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {column.footerCta ? (
                <Link
                  href={column.footerCta.href}
                  className="mt-4 inline-flex font-mono text-[10px] uppercase tracking-[0.06em] text-[#B91C1C] no-underline transition-colors duration-150 hover:text-[#DC2626]"
                >
                  {column.footerCta.label}
                </Link>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-8 text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs">
            © 2025 Racko. All rights reserved. · Privacy Policy · Terms
          </p>
          <p className="text-[11px]">
            AWS Partner · Azure Authorized · GCP Partner
          </p>
        </div>
      </div>
    </footer>
  );
}
