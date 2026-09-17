"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Cloud, Globe, ShieldCheck, Zap, type LucideIcon } from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;

type Feature = {
  title: string;
  description: string;
  Icon: LucideIcon;
};

const features: Feature[] = [
  {
    title: "Global Regions",
    description:
      "12+ regions across 6 continents, built for lower latency, reliable performance, and global reach.",
    Icon: Cloud,
  },
  {
    title: "Reliable by Design",
    description:
      "Reliable solutions designed for consistent uptime, performance, and business continuity.",
    Icon: Zap,
  },
  {
    title: "High Availability",
    description: "12+ regions across 6 continents for lower latency and better reach",
    Icon: ShieldCheck,
  },
  {
    title: "Global Regions",
    description: "12+ regions across 6 continents for lower latency and better reach",
    Icon: Globe,
  },
];

const stats: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: "12+", label: "Region", Icon: Globe },
  { value: "99.99%", label: "Uptime SLA", Icon: Zap },
  { value: "50+", label: "Edge Location", Icon: ShieldCheck },
  { value: "70+", label: "Countries", Icon: Cloud },
];

export default function GlobalInfrastructureSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden bg-[#050505]">
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-20"
        initial={reduceMotion ? false : { opacity: 0, scale: 1.12 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 1.1, ease: easeOut }}
      >
        <motion.div
          className="absolute inset-0"
          animate={reduceMotion ? undefined : { scale: [1, 1.055, 1], x: ["0%", "-1.1%", "0%"] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        >
          <Image
            src="/images/global-infrastructure-bg.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-right"
          />
        </motion.div>
      </motion.div>

      <div aria-hidden className="absolute inset-0 -z-10 bg-[rgba(5,5,5,0.72)] md:hidden" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 hidden md:block"
        style={{
          background:
            "linear-gradient(90deg, #050505 0%, rgba(5,5,5,0.9) 18%, rgba(5,5,5,0.55) 32%, rgba(5,5,5,0.14) 44%, rgba(5,5,5,0) 56%)",
        }}
      />

      <motion.span
        aria-hidden
        className="pointer-events-none absolute right-[5%] top-1/2 -z-10 hidden aspect-square w-[34%] -translate-y-1/2 rounded-full blur-[90px] md:block"
        style={{
          background:
            "radial-gradient(circle, rgba(220,38,38,0.40) 0%, rgba(220,38,38,0.12) 46%, transparent 70%)",
        }}
        animate={reduceMotion ? undefined : { opacity: [0.45, 0.95, 0.45], scale: [0.92, 1.08, 0.92] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.span
        aria-hidden
        className="pointer-events-none absolute right-[2%] top-1/2 -z-10 hidden aspect-square w-[40%] -translate-y-1/2 rounded-full opacity-[0.24] blur-[34px] md:block"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(239,68,68,0) 0%, rgba(239,68,68,0.5) 20%, rgba(239,68,68,0) 46%)",
        }}
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />

      {[0, 1, 2].map((ring) => (
        <motion.span
          key={ring}
          aria-hidden
          className="pointer-events-none absolute right-[13%] top-1/2 -z-10 hidden aspect-square w-[18%] -translate-y-1/2 rounded-full border border-[rgba(239,68,68,0.45)] md:block"
          initial={{ scale: 0.55, opacity: 0 }}
          animate={reduceMotion ? undefined : { scale: [0.55, 2], opacity: [0.5, 0] }}
          transition={{
            duration: 3.6,
            repeat: Infinity,
            ease: "easeOut",
            delay: ring * 1.2,
          }}
        />
      ))}

      <div className="mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid items-end gap-12 lg:grid-cols-2 lg:gap-10">
          <div className="min-w-0 max-w-[540px]">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, ease: easeOut }}
              className="flex items-center gap-2"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#DC2626]" aria-hidden />
              <span className="font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-[#C4C4C4]">
                Global Infrastructure
              </span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, ease: easeOut, delay: 0.06 }}
              className="mt-4 font-sans text-[clamp(28px,3.4vw,42px)] font-extrabold leading-[1.12] tracking-[-0.03em] text-white"
            >
              Built to Power <span className="text-[#DC2626]">What&rsquo;s Next</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: easeOut, delay: 0.12 }}
              className="mt-4 max-w-[540px] font-sans text-[14px] leading-[1.6] text-[#A8A8A8]"
            >
              Powering businesses with secure, scalable cloud infrastructure across regions, built
              for reliable performance and seamless growth
            </motion.p>

            <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              {features.map((feature, index) => (
                <FeatureItem key={feature.title + index} feature={feature} delay={index * 0.08} />
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: easeOut, delay: 0.3 }}
              className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6"
            >
              <Link
                href="/platform#footprint"
                className="group inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-[8px] bg-[#DC2626] px-7 font-sans text-[14px] font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#EF4444] hover:shadow-[0_14px_34px_rgba(220,38,38,0.42)] sm:w-auto"
              >
                Explore Global Regions
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  strokeWidth={2}
                  aria-hidden
                />
              </Link>
              <Link
                href="/resources"
                className="group inline-flex items-center gap-2 font-sans text-[13px] font-medium text-white transition-colors duration-300 hover:text-[#F87171]"
              >
                View Instruction
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  strokeWidth={1.8}
                  aria-hidden
                />
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: easeOut, delay: 0.2 }}
            className="w-full lg:max-w-[600px] lg:justify-self-end"
          >
            <div className="grid grid-cols-2 gap-y-6 rounded-[16px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,10,12,0.72)] px-3 py-6 backdrop-blur-md sm:flex sm:items-stretch sm:px-2">
              {stats.map((stat, index) => (
                <div
                  key={stat.label}
                  className={`group flex min-w-0 flex-1 flex-col px-4 sm:px-6 ${
                    index > 0 ? "sm:border-l sm:border-[rgba(255,255,255,0.1)]" : ""
                  }`}
                >
                  <stat.Icon
                    className="h-[22px] w-[22px] text-[#DC2626] transition-transform duration-300 group-hover:scale-110"
                    strokeWidth={1.7}
                    aria-hidden
                  />
                  <p className="mt-3 font-sans text-[clamp(22px,2.2vw,28px)] font-bold leading-none tracking-[-0.02em] text-white">
                    {stat.value}
                  </p>
                  <p className="mt-2 font-sans text-[12px] text-[#8A8A8A]">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FeatureItem({ feature, delay }: { feature: Feature; delay: number }) {
  const { title, description, Icon } = feature;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: easeOut, delay }}
      className="group flex min-w-0 items-start gap-3.5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(220,38,38,0.35)] bg-[rgba(185,28,28,0.12)] transition-all duration-300 group-hover:border-[rgba(239,68,68,0.7)] group-hover:bg-[rgba(185,28,28,0.22)] group-hover:shadow-[0_0_20px_rgba(185,28,28,0.32)]">
        <Icon
          className="h-[18px] w-[18px] text-[#EF4444] transition-transform duration-300 group-hover:scale-110"
          strokeWidth={1.7}
          aria-hidden
        />
      </span>
      <span className="min-w-0">
        <span className="block font-sans text-[15px] font-bold tracking-[-0.01em] text-white">
          {title}
        </span>
        <span className="mt-1.5 block font-sans text-[11.5px] leading-[1.55] text-[#8A8A8A] transition-colors duration-300 group-hover:text-[#A8A8A8]">
          {description}
        </span>
      </span>
    </motion.div>
  );
}
