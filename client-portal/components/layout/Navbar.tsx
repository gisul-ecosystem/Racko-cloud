"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "@/lib/constants";
import { useDemoModal } from "@/components/ui/DemoModalContext";

const INDUSTRY_LINKS = [
  { label: "EdTech", href: "/industries/edtech" },
  { label: "AI-Native Startups", href: "/industries/ai-startups" },
  { label: "BPO / KPO", href: "/industries/bpo-kpo" },
  { label: "Manufacturing", href: "/industries/manufacturing" },
  { label: "Healthcare", href: "/industries/healthcare" },
] as const;

const COMPANY_LINKS = [
  { label: "About Racko", href: "/company/about" },
  { label: "Ecosystem Partners", href: "/company/partners" },
  { label: "Contact", href: "/company/contact" },
] as const;

type NavLinkItem = { label: string; href: string };

function dropdownForNavLabel(label: string): {
  links: readonly NavLinkItem[];
  footer?: NavLinkItem;
} | null {
  switch (label) {
    case "Industries":
      return { links: INDUSTRY_LINKS };
    case "Company":
      return { links: COMPANY_LINKS };
    default:
      return null;
  }
}

function navItemIsActive(pathname: string, label: string, href: string): boolean {
  if (label === "Products") return pathname.startsWith("/products");
  if (label === "CloudLabs") return pathname.startsWith("/cloudlabs");
  if (label === "Solutions") return pathname.startsWith("/solutions");
  if (label === "Industries") return pathname.startsWith("/industries");
  if (label === "Platform") return pathname.startsWith("/platform");
  if (label === "Company") return pathname.startsWith("/company");
  return pathname.startsWith(href);
}

function wideDropdownClass(label: string): string {
  return label === "Industries" ? "w-[300px]" : "";
}

export default function Navbar() {
  const pathname = usePathname();
  const { openModal } = useDemoModal();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setMobileExpanded(null);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDropdown(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-[1000] h-[68px] border-b border-[rgba(255,255,255,0.08)] bg-[#111111]">
      <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 xl:px-10">
        <Link href="/" className="inline-flex min-w-0 shrink items-center gap-2 sm:gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Racko"
            fetchPriority="high"
            width="160"
            height="42"
            decoding="async"
            data-nimg="1"
            className="h-8 w-auto sm:h-10"
            src="/images/racko-logo.png"
            style={{ color: "transparent" }}
          />
        </Link>

        <nav ref={navRef} className="hidden items-center gap-5 lg:flex xl:gap-7">
          {NAV_LINKS.map((item) => {
            const isActive = navItemIsActive(pathname, item.label, item.href);
            const isDropdownOpen = openDropdown === item.label;
            const panel = item.hasDropdown ? dropdownForNavLabel(item.label) : null;

            return (
              <div key={item.label} className="relative">
                {item.hasDropdown ? (
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(isDropdownOpen ? null : item.label)}
                    className={`inline-flex items-center gap-1 text-[14px] font-normal transition-colors duration-150 ${
                      isDropdownOpen || isActive ? "text-white" : "text-[#6B6B6B] hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      aria-hidden
                      className={`transition-transform duration-200 ${
                        isDropdownOpen ? "rotate-180" : "rotate-0"
                      }`}
                    >
                      <path
                        d="M2.25 3.75L5 6.5L7.75 3.75"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    className={`inline-flex items-center gap-1 text-[14px] font-normal transition-colors duration-150 ${
                      isActive ? "text-white" : "text-[#6B6B6B] hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                )}

                <AnimatePresence>
                  {item.hasDropdown && isDropdownOpen && panel ? (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className={`absolute left-0 top-[calc(100%+8px)] z-[200] min-w-[220px] overflow-hidden rounded-[8px] border border-[rgba(255,255,255,0.1)] bg-[#111111] px-0 py-1 shadow-[0_16px_48px_rgba(0,0,0,0.6)] ${wideDropdownClass(item.label)}`}
                    >
                      <div className="mb-0.5 border-b border-[rgba(255,255,255,0.06)] px-[14px] pb-[5px] pt-[6px]">
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#3D3D3D]">
                          {item.label.toUpperCase()}
                        </p>
                      </div>

                      {panel.links.map((dropdownItem) => (
                        <Link
                          key={dropdownItem.label}
                          href={dropdownItem.href}
                          onClick={() => setOpenDropdown(null)}
                          className="group relative flex items-center gap-2.5 px-[14px] py-[7px] no-underline transition-colors duration-150 hover:bg-[rgba(255,255,255,0.04)] hover:shadow-[inset_2px_0_0_#B91C1C]"
                        >
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[#B91C1C] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                          <span className="flex-1 font-sans text-[12px] font-medium text-[#A1A1A1] transition-colors duration-150 group-hover:text-white">
                            {dropdownItem.label}
                          </span>
                          <span className="font-mono text-[11px] text-[#3D3D3D] transition-all duration-150 group-hover:translate-x-[2px] group-hover:text-[#B91C1C]">
                            →
                          </span>
                        </Link>
                      ))}

                      {panel.footer ? (
                        <div className="mt-0.5 border-t border-[rgba(255,255,255,0.06)] px-[14px] pb-[6px] pt-[6px]">
                          <Link
                            href={panel.footer.href}
                            onClick={() => setOpenDropdown(null)}
                            className="font-mono text-[10px] text-[#B91C1C] transition-colors duration-150 hover:text-[#DC2626]"
                          >
                            {panel.footer.label}
                          </Link>
                        </div>
                      ) : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-border-strong text-bg-50 transition-colors hover:bg-bg-700 lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6L18 18M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7H20M4 12H20M4 17H20"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
          <Link
            href="/company/contact"
            className="hidden rounded-[6px] border border-border-strong bg-transparent px-3 py-2 text-xs font-medium text-bg-50 transition-all hover:bg-bg-700 sm:inline-flex lg:hidden"
          >
            Contact
          </Link>
          <a
            href="tel:+918197982153"
            className="hidden items-center gap-2 rounded-[5px] border border-[rgba(255,255,255,0.15)] bg-transparent px-5 py-[10px] font-mono text-[13px] font-medium text-white transition-all duration-150 hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.04)] lg:flex"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "#B91C1C", flexShrink: 0 }}
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            +91 81979 82153
          </a>
          <Link
            href="/login"
            className="hidden items-center gap-2 rounded-[6px] border border-[rgba(255,255,255,0.15)] bg-transparent px-5 py-[10px] text-[13px] font-medium text-white transition-all duration-150 hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.04)] lg:inline-flex"
          >
            Login
          </Link>
          <button
            type="button"
            onClick={openModal}
            className="hidden items-center gap-2 rounded-[6px] bg-crimson-500 px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 ease-out hover:-translate-y-[1px] hover:bg-crimson-400 lg:inline-flex"
          >
            Book a Racko Meet
            <span aria-hidden>›</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            key="mobile-nav"
            id="mobile-nav"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-x-0 bottom-0 top-[68px] z-[999] flex flex-col border-t border-[rgba(255,255,255,0.08)] bg-[#0E0E0E] lg:hidden"
          >
            <nav
              className="no-scrollbar mx-auto flex w-full max-w-lg flex-1 flex-col gap-1 overflow-y-auto overscroll-y-contain px-4 py-5 pb-8 sm:px-6"
              aria-label="Mobile"
            >
              {NAV_LINKS.map((item) => {
                const isActive = navItemIsActive(pathname, item.label, item.href);
                const expanded = mobileExpanded === item.label;
                const panel = item.hasDropdown ? dropdownForNavLabel(item.label) : null;

                if (!item.hasDropdown) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`rounded-[6px] px-3 py-3 font-sans text-[15px] font-medium ${
                        isActive ? "bg-[rgba(185,28,28,0.12)] text-white" : "text-[#A1A1A1] hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                }

                return (
                  <div key={item.label} className="rounded-[6px] border border-[rgba(255,255,255,0.06)] bg-[#111111]">
                    <button
                      type="button"
                      onClick={() => setMobileExpanded(expanded ? null : item.label)}
                      className="flex w-full items-center justify-between px-3 py-3 text-left font-sans text-[15px] font-medium text-white"
                    >
                      {item.label}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 10 10"
                        fill="none"
                        aria-hidden
                        className={`shrink-0 text-[#6B6B6B] transition-transform ${expanded ? "rotate-180" : ""}`}
                      >
                        <path
                          d="M2.25 3.75L5 6.5L7.75 3.75"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {expanded && panel ? (
                      <div className="border-t border-[rgba(255,255,255,0.06)] px-2 pb-3 pt-1">
                        <p className="px-2 pb-1 pt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#3D3D3D]">
                          {item.label.toUpperCase()}
                        </p>
                        {panel.links.map((dropdownItem) => (
                          <Link
                            key={dropdownItem.label}
                            href={dropdownItem.href}
                            onClick={() => setMobileOpen(false)}
                            className="block rounded-[4px] px-2 py-2 font-sans text-[13px] text-[#A1A1A1] hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
                          >
                            {dropdownItem.label}
                          </Link>
                        ))}
                        {panel.footer ? (
                          <Link
                            href={panel.footer.href}
                            onClick={() => setMobileOpen(false)}
                            className="mt-1 block px-2 py-2 font-mono text-[11px] text-[#B91C1C]"
                          >
                            {panel.footer.label}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href="tel:+918197982153"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-[6px] border border-[rgba(255,255,255,0.15)] bg-transparent px-4 py-3 font-mono text-[13px] font-medium text-white transition-all duration-150 hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.04)]"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "#B91C1C", flexShrink: 0 }}
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  +91 81979 82153
                </a>
                <Link
                  href="/company/contact"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center justify-center rounded-[6px] border border-border-strong px-4 py-3 text-sm font-medium text-white hover:bg-bg-700"
                >
                  Contact
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.15)] bg-transparent px-4 py-3 text-sm font-medium text-white hover:bg-[rgba(255,255,255,0.04)]"
                >
                  Login
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    openModal();
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-[6px] bg-crimson-500 px-4 py-3 text-sm font-medium text-white hover:bg-crimson-400"
                >
                  Book a Racko Meet
                  <span aria-hidden>›</span>
                </button>
              </div>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
