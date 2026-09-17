"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const FEATURED_IMAGE = "/images/image 224.png";

const featuredSpecs = ["4 vCPU", "8 GB RAM", "NVMe SSD"] as const;

const easeOut = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-[100svh] w-full min-w-0 flex-col overflow-hidden bg-[#050505] pt-[68px]">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={reduceMotion ? undefined : { opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 0% 45%, rgba(127,29,29,0.42) 0%, rgba(80,10,10,0.18) 38%, transparent 68%), radial-gradient(ellipse 50% 40% at 8% 90%, rgba(185,28,28,0.12), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[55%] opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(185,28,28,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(185,28,28,0.35) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "linear-gradient(to right, black 0%, transparent 88%)",
          WebkitMaskImage: "linear-gradient(to right, black 0%, transparent 88%)",
        }}
      />

      <div className="relative z-[1] mx-auto flex w-full max-w-[1440px] flex-1 flex-col justify-center px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-12 lg:px-12 xl:px-16">
        <div>
          <motion.span
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut }}
            className="racko-hero-badge-pulse inline-flex items-center rounded-full border border-[rgba(185,28,28,0.55)] bg-[rgba(80,12,12,0.55)] px-3.5 py-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[#FECACA]"
            style={{ animation: reduceMotion ? undefined : "racko-hero-badge 2.8s ease-out infinite" }}
          >
            Global Infrastructure
          </motion.span>

          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeOut, delay: 0.08 }}
            className="mt-6 max-w-[920px] font-sans text-[clamp(40px,6.2vw,76px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-white"
          >
            GLOBAL CLOUD
            <br />
            INFRASTRUCTURE
          </motion.h1>

          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: easeOut, delay: 0.18 }}
            className="mt-5 font-sans text-[15px] font-normal text-[#8A8A8A] sm:text-[16px]"
          >
            Infrastructure for what you&apos;re building.
          </motion.p>
        </div>

        <div className="mt-10 grid grid-cols-1 items-stretch gap-4 lg:mt-12 lg:grid-cols-[1.28fr_0.86fr_0.86fr] lg:gap-5">
          <FeaturedCard reduceMotion={!!reduceMotion} />
          <PlanCard
            title="Cloud VPS"
            subtitle="For AI, ML and rendering"
            price="$59"
            period="/hr"
            href="/products/cloud-vps"
            delay={0.28}
            reduceMotion={!!reduceMotion}
          />
          <PlanCard
            title="Dedicated Server"
            subtitle="Dedicated resources. Full Control"
            price="$199"
            period="/hr"
            href="/products/dedicated-server"
            delay={0.36}
            reduceMotion={!!reduceMotion}
          />
        </div>
      </div>
    </section>
  );
}

function CardShine() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[22px]"
    >
      <div className="racko-hero-shine absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.09] to-transparent opacity-0 group-hover:opacity-100" />
    </div>
  );
}

function FeaturedCard({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: easeOut, delay: 0.2 }}
      whileHover={
        reduceMotion
          ? undefined
          : {
              y: -8,
              transition: { type: "spring", stiffness: 320, damping: 24 },
            }
      }
      className="group relative overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.14)] bg-[rgba(12,8,8,0.72)] p-6 shadow-[0_0_80px_rgba(185,28,28,0.08)] transition-[border-color,box-shadow] duration-300 hover:border-[rgba(239,68,68,0.45)] hover:shadow-[0_24px_70px_rgba(185,28,28,0.22)] sm:p-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(ellipse 70% 90% at 0% 50%, rgba(185,28,28,0.22), transparent 62%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-[#B91C1C]/0 blur-3xl transition-all duration-500 group-hover:bg-[#B91C1C]/25"
      />
      <CardShine />
      <div className="relative flex h-full flex-col gap-6 sm:flex-row sm:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="font-sans text-[28px] font-semibold tracking-[-0.03em] text-white transition-transform duration-300 group-hover:translate-x-0.5 sm:text-[32px]">
            Cloud VPS
          </h2>
          <p className="mt-1.5 font-sans text-[14px] leading-snug text-[#8A8A8A] sm:text-[15px]">
            Scalable virtual machines for your workload
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {featuredSpecs.map((spec) => (
              <span
                key={spec}
                className="inline-flex items-center rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-3 py-1 font-sans text-[12px] text-[#C9C9C9] transition-all duration-200 group-hover:border-[rgba(255,255,255,0.28)] group-hover:bg-[rgba(255,255,255,0.07)] group-hover:text-white"
              >
                {spec}
              </span>
            ))}
          </div>
          <div className="mt-auto flex flex-col gap-5 pt-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-sans text-[14px] text-[#8A8A8A]">Starting at</p>
              <p className="mt-0.5 font-sans text-[44px] font-semibold leading-none tracking-[-0.04em] text-white sm:text-[48px]">
                $599
                <span className="text-[22px] font-medium tracking-normal text-[#A1A1A1]">/mo</span>
              </p>
            </div>
            <Link
              href="/products/cloud-vps"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#DC2626] px-7 text-[14px] font-medium text-white shadow-[0_0_0_0_rgba(220,38,38,0)] transition-all duration-300 hover:bg-[#EF4444] hover:shadow-[0_10px_28px_rgba(220,38,38,0.38)] group-hover:translate-y-0"
            >
              See Plans
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-center sm:w-[42%] sm:max-w-[240px]">
          <div
            className="racko-hero-float"
            style={{
              animation: reduceMotion ? undefined : "racko-hero-float 5.2s ease-in-out infinite",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={FEATURED_IMAGE}
              alt="Cloud VPS server stack"
              className="h-auto w-[200px] max-w-full object-contain drop-shadow-[0_20px_40px_rgba(185,28,28,0.35)] transition-[transform,filter] duration-500 ease-out group-hover:scale-[1.07] group-hover:drop-shadow-[0_28px_50px_rgba(185,28,28,0.5)] sm:w-[220px]"
            />
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function PlanCard({
  title,
  subtitle,
  price,
  period,
  href,
  delay,
  reduceMotion,
}: {
  title: string;
  subtitle: string;
  price: string;
  period: string;
  href: string;
  delay: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: easeOut, delay }}
      whileHover={
        reduceMotion
          ? undefined
          : {
              y: -8,
              transition: { type: "spring", stiffness: 320, damping: 24 },
            }
      }
      className="group relative flex flex-col overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.1)] bg-[#070707] px-7 py-7 transition-[border-color,box-shadow,background-color] duration-300 hover:border-[rgba(255,255,255,0.28)] hover:bg-[#0C0C0C] hover:shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
    >
      <CardShine />
      <h2 className="relative font-sans text-[26px] font-semibold tracking-[-0.03em] text-white transition-transform duration-300 group-hover:translate-x-0.5 sm:text-[28px]">
        {title}
      </h2>
      <p className="relative mt-1.5 font-sans text-[14px] text-[#8A8A8A] transition-colors duration-300 group-hover:text-[#B3B3B3] sm:text-[15px]">
        {subtitle}
      </p>
      <div className="relative mt-auto pt-10">
        <p className="font-sans text-[14px] text-[#8A8A8A]">Starting at</p>
        <p className="mt-1 font-sans text-[44px] font-semibold leading-none tracking-[-0.04em] text-white sm:text-[48px]">
          {price}
          <span className="text-[20px] font-medium tracking-normal text-[#A1A1A1]">{period}</span>
        </p>
        <Link
          href={href}
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[rgba(255,255,255,0.22)] bg-transparent text-[14px] font-medium text-white transition-all duration-300 hover:border-white hover:bg-[rgba(255,255,255,0.06)] group-hover:border-[rgba(255,255,255,0.4)]"
        >
          See Plans
          <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>
    </motion.article>
  );
}
