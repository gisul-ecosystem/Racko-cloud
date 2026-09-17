"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  Globe,
  Headphones,
  Lock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { PRODUCT_NAV_LINKS } from "@/lib/constants";

const easeOut = [0.22, 1, 0.36, 1] as const;

type Stat = {
  value: string;
  label: string;
  description: string;
  Icon: LucideIcon;
};

const stats: Stat[] = [
  {
    value: "15+",
    label: "Global Workload Support",
    description:
      "Infrastructure strategies for distributed environments and international operations.",
    Icon: Globe,
  },
  {
    value: "99.99%",
    label: "Reliable Performance",
    description:
      "Architecture designed for consistent availability and dependable workload performance.",
    Icon: ShieldCheck,
  },
  {
    value: "Low",
    label: "Optimized Connectivity",
    description:
      "Network planning and infrastructure placement for latency-sensitive applications.",
    Icon: Activity,
  },
  {
    value: "Enterprise",
    label: "Security & Governance",
    description: "Access control, data protection, policy enforcement, and operational visibility.",
    Icon: Lock,
  },
  {
    value: "24/7",
    label: "24/7 Expert Support",
    description:
      "Continuous monitoring and responsive assistance for critical infrastructure environments.",
    Icon: Headphones,
  },
];

export default function ReadyToBuildSection() {
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <section className="relative isolate overflow-hidden bg-[#050505]">
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-20"
        animate={reduceMotion ? undefined : { opacity: [0.88, 1, 0.88] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <Image
          src="/images/Frame 10435.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center lg:object-fill"
        />
      </motion.div>

      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 46% 58% at 50% 40%, rgba(5,5,5,0.66) 0%, rgba(5,5,5,0.2) 60%, transparent 78%), linear-gradient(180deg, rgba(5,5,5,0.3) 0%, transparent 18%, transparent 70%, rgba(5,5,5,0.4) 100%)",
        }}
      />

      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6 sm:py-11 lg:px-8 lg:py-12">
        <div className="flex flex-col items-center text-center">
          <motion.span
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, ease: easeOut }}
            className="inline-flex items-center rounded-full bg-[#FBD8D8] px-4 py-[7px] font-sans text-[11.5px] font-medium text-[#9B1C1C] shadow-[0_6px_20px_rgba(185,28,28,0.28)]"
          >
            Ready to Build?
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: easeOut, delay: 0.08 }}
            className="mt-4 max-w-[700px] font-sans text-[clamp(25px,3.3vw,40px)] font-extrabold leading-[1.14] tracking-[-0.03em] text-white"
          >
            Build, Scale, And Operate With Confidence.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: easeOut, delay: 0.16 }}
            className="mt-3.5 max-w-[660px] font-sans text-[13px] leading-[1.6] text-[#D4D4D4]"
          >
            Work with Racko to design secure, high-performance cloud infrastructure for critical
            workloads&mdash;backed by reliable managed operations and expert support.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: easeOut, delay: 0.24 }}
            className="mt-7 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center"
          >
            <Link
              href="/assessment"
              className="group inline-flex h-11 items-center justify-center gap-2.5 rounded-[8px] bg-white px-6 font-sans text-[13.5px] font-semibold text-[#0A0A0A] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(255,255,255,0.22)]"
            >
              Book a Racko Meet
              <ArrowRight
                className="h-4 w-4 text-[#DC2626] transition-transform duration-300 group-hover:translate-x-1"
                strokeWidth={2.2}
                aria-hidden
              />
            </Link>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                className="group inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[8px] border border-[rgba(255,255,255,0.22)] bg-[rgba(10,10,12,0.55)] px-5 font-sans text-[13.5px] font-medium text-white backdrop-blur-sm outline-none transition-all duration-300 hover:border-[rgba(255,255,255,0.4)] hover:bg-[rgba(10,10,12,0.75)] focus-visible:ring-2 focus-visible:ring-[rgba(220,38,38,0.6)] sm:w-auto"
              >
                Explore Racko Products
                <motion.span
                  className="flex"
                  animate={{ rotate: menuOpen ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: easeOut }}
                >
                  <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
                </motion.span>
              </button>

              <AnimatePresence>
                {menuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.22, ease: easeOut }}
                    className="absolute left-1/2 top-full z-20 mt-2.5 w-[300px] -translate-x-1/2 origin-top overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,10,12,0.96)] p-2 text-left shadow-[0_24px_60px_rgba(0,0,0,0.6)] backdrop-blur-md sm:w-[340px]"
                  >
                    <div className="grid grid-cols-2 gap-1">
                      {PRODUCT_NAV_LINKS.map((product) => (
                        <Link
                          key={product.href}
                          href={product.href}
                          onClick={() => setMenuOpen(false)}
                          className="rounded-[8px] px-3 py-2 font-sans text-[12.5px] text-[#C4C4C4] transition-colors duration-200 hover:bg-[rgba(220,38,38,0.14)] hover:text-white"
                        >
                          {product.label}
                        </Link>
                      ))}
                    </div>
                    <Link
                      href="/products"
                      onClick={() => setMenuOpen(false)}
                      className="mt-1 flex items-center justify-between gap-2 rounded-[8px] border-t border-[rgba(255,255,255,0.09)] px-3 py-2.5 font-sans text-[12px] font-semibold text-[#EF4444] transition-colors duration-200 hover:text-[#F87171]"
                    >
                      View all products
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </Link>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: easeOut, delay: 0.3 }}
          className="mt-8 rounded-[14px] border border-[rgba(255,255,255,0.1)] bg-[rgba(8,8,10,0.82)] p-4 backdrop-blur-md sm:p-5 lg:mt-9 lg:px-2 lg:py-5"
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-0">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, ease: easeOut, delay: 0.36 + index * 0.08 }}
                className={`group flex min-w-0 flex-col lg:px-5 ${
                  index > 0 ? "lg:border-l lg:border-[rgba(255,255,255,0.1)]" : ""
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[rgba(220,38,38,0.35)] bg-[rgba(185,28,28,0.16)] transition-all duration-300 group-hover:border-[rgba(239,68,68,0.7)] group-hover:bg-[rgba(185,28,28,0.28)] group-hover:shadow-[0_0_18px_rgba(185,28,28,0.35)]">
                    <stat.Icon
                      className="h-4 w-4 text-[#EF4444] transition-transform duration-300 group-hover:scale-110"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-sans text-[15px] font-bold leading-tight tracking-[-0.01em] text-white">
                      {stat.value}
                    </span>
                    <span className="mt-0.5 block font-sans text-[11px] leading-tight text-[#A8A8A8]">
                      {stat.label}
                    </span>
                  </span>
                </div>
                <p className="mt-2.5 font-sans text-[10px] leading-[1.5] text-[#7A7A7A] transition-colors duration-300 group-hover:text-[#9A9A9A]">
                  {stat.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
