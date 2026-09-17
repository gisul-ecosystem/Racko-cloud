"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Copyright, ShieldCheck } from "lucide-react";

const MAP_IMAGE = "/images/ChatGPT Image Jul 20, 2026, 04_11_36 PM 3.png";

type FooterColumn = {
  title: string;
  links: { label: string; href: string }[];
};

const footerColumns: FooterColumn[] = [
  {
    title: "Products",
    links: [
      { label: "VPS & Cloud VPS", href: "/products/cloud-vps" },
      { label: "Dedicated Servers", href: "/products/dedicated-server" },
      { label: "Dedicated & Private Cloud", href: "/products/private-cloud" },
      { label: "GPU Cloud", href: "/products/gpu-cloud" },
      { label: "S3 Storage", href: "/products/s3-storage" },
      { label: "Backup Storage", href: "/products/backup-storage" },
      { label: "CloudLabs", href: "/cloudlabs" },
      { label: "Managed Operations", href: "/products/managed-ops" },
    ],
  },
  {
    title: "Solution",
    links: [
      { label: "For Startups", href: "/use-cases/ai-startups" },
      { label: "For Enterprises", href: "/solutions" },
      { label: "AI & ML Workloads", href: "/products/gpu-cloud" },
      { label: "EdTech & Training", href: "/use-cases/edtech" },
      { label: "Hybrid Cloud", href: "/platform" },
      { label: "Disaster Recovery", href: "/products/backup-storage" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/resources" },
      { label: "Customer Stories", href: "/resources#stories" },
      { label: "Engineering Insights", href: "/resources#insights" },
      { label: "Guides", href: "/resources#guides" },
      { label: "API Reference", href: "/developers/api" },
      { label: "Service Status", href: "/status" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Racko", href: "/company/about" },
      { label: "Careers", href: "/company/careers" },
      { label: "Partners", href: "/company/partners" },
      { label: "Newsroom", href: "/company/newsroom" },
      { label: "Contact Us", href: "/company/contact" },
    ],
  },
];

const socialLinks = [
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/racko",
    path: "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zm1.78 13.02H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z",
  },
  {
    label: "GitHub",
    href: "https://github.com/racko",
    path: "M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.3-.6-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.9 18.3 5.2 18.3 5.2c.7 1.6.3 2.9.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z",
  },
  {
    label: "X",
    href: "https://x.com/racko",
    path: "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24H16.2l-5.21-6.81-5.95 6.81H1.73l7.5-8.57L1.07 2.25h6.79l4.87 6.4 5.51-6.4zm-1.16 17.52h1.83L6.99 4.13H5.03l12.05 15.64z",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@racko",
    path: "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z",
  },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms Of Service", href: "/terms" },
];

export default function Footer() {
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setEmail("");
  };

  return (
    <footer className="relative isolate overflow-hidden border-t border-[rgba(255,255,255,0.08)] bg-[#050505]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(185,28,28,0.16) 0%, transparent 70%)",
        }}
      />

      <div className="mx-auto w-full max-w-[1280px] px-4 pt-14 sm:px-6 lg:px-8 lg:pt-16">
        <div className="grid gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[240px_repeat(4,minmax(0,1fr))_250px]">
          <div className="min-w-0">
            <Link href="/" className="inline-flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/racko-logo.png"
                alt="Racko"
                width="160"
                height="42"
                decoding="async"
                fetchPriority="low"
                className="h-9 w-auto"
                style={{ color: "transparent" }}
              />
            </Link>

            <p className="mt-3.5 font-sans text-[9.5px] font-medium uppercase tracking-[0.1em] text-[#DC2626]">
              Global Enterprise Cloud Infrastructure
            </p>

            <p className="mt-4 font-sans text-[11px] leading-[1.7] text-[#A0A0A0]">
              Secure, Scalable Cloud Infrastructure For Compute, AI, Storage, Backup, CloudLabs,
              And Managed Operations&mdash;Built For Critical Workloads Worldwide.
            </p>

            <div className="mt-6 max-w-[290px]">
              <Image
                src={MAP_IMAGE}
                alt="Racko global infrastructure footprint"
                width={433}
                height={289}
                sizes="290px"
                className="h-auto w-full select-none"
                draggable={false}
              />
            </div>
          </div>

          {footerColumns.map((column) => (
            <nav key={column.title} aria-label={column.title} className="min-w-0">
              <p className="font-sans text-[11.5px] font-bold uppercase tracking-[0.08em] text-white">
                {column.title}
              </p>
              <ul className="mt-5 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-block font-sans text-[12px] leading-snug text-[#A0A0A0] no-underline transition-all duration-200 hover:translate-x-0.5 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="min-w-0">
            <p className="font-sans text-[11.5px] font-bold uppercase tracking-[0.08em] text-white">
              Stay Updated
            </p>

            <p className="mt-5 font-sans text-[11px] leading-[1.7] text-[#A0A0A0]">
              Get Cloud Infrastructure Insights, Technical Guides, Product News, And The Latest
              Updates From Racko.
            </p>

            <form onSubmit={handleSubscribe} className="mt-5">
              <div className="flex overflow-hidden rounded-[6px] border border-[rgba(255,255,255,0.14)] bg-[#0C0C0D] transition-colors duration-200 focus-within:border-[rgba(220,38,38,0.6)]">
                <label htmlFor="footer-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="footer-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter Your Email Address"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-sans text-[11.5px] text-white outline-none placeholder:text-[#6B6B6B]"
                />
                <button
                  type="submit"
                  className="shrink-0 bg-[#DC2626] px-3.5 font-sans text-[11.5px] font-medium text-white transition-colors duration-200 hover:bg-[#EF4444]"
                >
                  Subscribe
                </button>
              </div>
              {subscribed ? (
                <p
                  role="status"
                  className="mt-2 font-sans text-[10.5px] text-[#16A34A]"
                >
                  Thanks &mdash; we&rsquo;ll be in touch.
                </p>
              ) : null}
            </form>

            <div className="mt-6 flex items-center gap-5">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={social.label}
                  className="text-white transition-all duration-200 hover:-translate-y-0.5 hover:text-[#EF4444]"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
                    <path d={social.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>

        <motion.div
          aria-hidden
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-14 select-none lg:mt-20"
        >
          <motion.p
            animate={
              reduceMotion
                ? undefined
                : {
                    filter: [
                      "drop-shadow(0 0 14px rgba(220,38,38,0.35))",
                      "drop-shadow(0 0 30px rgba(220,38,38,0.7))",
                      "drop-shadow(0 0 14px rgba(220,38,38,0.35))",
                    ],
                  }
            }
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            className="text-center font-sans text-[clamp(64px,25vw,336px)] font-bold leading-[0.8] tracking-[-0.02em] text-transparent [-webkit-text-stroke:2px_#DC2626]"
            style={{ filter: "drop-shadow(0 0 18px rgba(220,38,38,0.45))" }}
          >
            RACKO
          </motion.p>
        </motion.div>

        <div className="mt-10 flex flex-col gap-4 border-t border-[rgba(255,255,255,0.08)] py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-sans text-[11px] text-[#8A8A8A]">
            <span className="inline-flex items-center gap-1.5">
              <Copyright className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden />
              2026 Racko. All Rights Reserved.
            </span>
            <Divider />
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#DC2626]" strokeWidth={1.7} aria-hidden />
              ISO/IEC 27001 Certified
            </span>
            <Divider />
            <span>Racko is owned and managed by Gisul Software Services.</span>
            <Divider />
            <span>SOC 2 Type II</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-sans text-[11px]">
            {legalLinks.map((link, index) => (
              <span key={link.href} className="inline-flex items-center gap-3">
                {index > 0 ? <Divider /> : null}
                <Link
                  href={link.href}
                  className="text-[#8A8A8A] no-underline transition-colors duration-200 hover:text-white"
                >
                  {link.label}
                </Link>
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function Divider() {
  return (
    <span aria-hidden className="text-[rgba(220,38,38,0.55)]">
      |
    </span>
  );
}
