"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Cloud,
  Globe,
  SlidersHorizontal,
} from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;

type Region = {
  value: string;
  label: string;
  monthly: string;
  hourly: string;
};

const REGIONS: Region[] = [
  { value: "india", label: "India", monthly: "₹1,499/mo", hourly: "₹2.40/hr" },
  { value: "singapore", label: "Singapore", monthly: "₹1,849/mo", hourly: "₹2.95/hr" },
  { value: "germany", label: "Germany", monthly: "₹1,999/mo", hourly: "₹3.20/hr" },
  { value: "united states", label: "United States", monthly: "₹2,099/mo", hourly: "₹3.35/hr" },
];

type Billing = "monthly" | "hourly";

const STEPS = [
  { label: "Choose", caption: "Select a product" },
  { label: "Configure", caption: "Region and resources" },
  { label: "Deploy", caption: "Review and launch" },
];

const STEP_DURATION = 1500;

export default function DeployPathSection() {
  const reduceMotion = useReducedMotion();
  const [regionValue, setRegionValue] = useState(REGIONS[0].value);
  const [billing, setBilling] = useState<Billing>("monthly");

  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { margin: "-120px" });
  const [activeStep, setActiveStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      setActiveStep(1);
      return;
    }
    if (!inView || paused) return;

    const id = window.setInterval(
      () => setActiveStep((step) => (step + 1) % STEPS.length),
      STEP_DURATION
    );
    return () => window.clearInterval(id);
  }, [reduceMotion, inView, paused]);

  const region = REGIONS.find((item) => item.value === regionValue) ?? REGIONS[0];
  const price = billing === "monthly" ? region.monthly : region.hourly;

  return (
    <section className="relative overflow-hidden bg-[#050505] py-16 sm:py-20 lg:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 45% at 50% 0%, rgba(185,28,28,0.16) 0%, transparent 64%)",
        }}
      />

      <div className="relative z-[1] mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: easeOut }}
        >
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#DC2626]">
            Deploy Without The Detour
          </p>
          <h2 className="mt-3.5 font-sans text-[clamp(28px,3.6vw,42px)] font-extrabold leading-[1.12] tracking-[-0.03em] text-white">
            Choose. Configure. Deploy.
          </h2>
          <p className="mt-3 font-sans text-[14px] leading-[1.6] text-[#8A8A8A]">
            One continuous path from product selection to running infrastructure.
          </p>
        </motion.div>

        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: easeOut, delay: 0.1 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          className="mt-8 rounded-[16px] border border-[rgba(255,255,255,0.09)] bg-[#0A0A0B] p-4 sm:p-6 lg:p-8"
        >
          <StepRail activeStep={activeStep} reduceMotion={Boolean(reduceMotion)} />

          <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_auto_1.15fr_auto_1fr] lg:items-stretch lg:gap-4">
            <Column title="Selected Product" delay={0.18} isActive={activeStep === 0}>
              <div className="group flex h-full flex-col rounded-[12px] border border-[rgba(255,255,255,0.09)] bg-[#0D0D0E] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,68,68,0.45)] hover:shadow-[0_18px_44px_rgba(185,28,28,0.18)]">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border border-[rgba(220,38,38,0.35)] bg-[rgba(185,28,28,0.14)] transition-transform duration-300 group-hover:scale-105">
                    <Cloud className="h-[18px] w-[18px] text-[#EF4444]" strokeWidth={1.7} aria-hidden />
                  </span>
                  <span className="shrink-0 rounded-full border border-[rgba(255,255,255,0.14)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#9A9A9A]">
                    Compute
                  </span>
                </div>

                <h3 className="mt-4 font-sans text-[19px] font-bold tracking-[-0.02em] text-white">
                  Cloud VPS
                </h3>
                <p className="mt-2 font-sans text-[12.5px] leading-[1.55] text-[#8A8A8A]">
                  Elastic virtual infrastructure for applications and APIs
                </p>

                <Link
                  href="/products/cloud-vps"
                  className="mt-auto flex items-center justify-between gap-3 border-t border-[rgba(255,255,255,0.09)] pt-3.5 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[#EF4444]"
                >
                  Explore
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                </Link>
              </div>
            </Column>

            <FlowArrow isActive={activeStep >= 1} reduceMotion={Boolean(reduceMotion)} delay={0} />

            <Column title="Configure Your Resource" delay={0.26} isActive={activeStep === 1}>
              <div className="flex h-full flex-col rounded-[12px] border border-[rgba(255,255,255,0.09)] bg-[#0D0D0E] p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor="racko-deploy-region"
                      className="block font-sans text-[11.5px] text-[#8A8A8A]"
                    >
                      Region
                    </label>
                    <div className="relative mt-2">
                      <Globe
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A8A8]"
                        strokeWidth={1.7}
                        aria-hidden
                      />
                      <select
                        id="racko-deploy-region"
                        value={regionValue}
                        onChange={(event) => setRegionValue(event.target.value)}
                        className="h-10 w-full cursor-pointer appearance-none rounded-[8px] border border-[rgba(255,255,255,0.12)] bg-[#111112] pl-9 pr-9 font-sans text-[13px] text-white outline-none transition-colors duration-200 hover:border-[rgba(239,68,68,0.45)] focus-visible:border-[#DC2626] focus-visible:ring-2 focus-visible:ring-[rgba(220,38,38,0.35)]"
                      >
                        {REGIONS.map((item) => (
                          <option key={item.value} value={item.value} className="bg-[#111112]">
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8A8A]"
                        strokeWidth={1.7}
                        aria-hidden
                      />
                    </div>
                  </div>

                  <div className="shrink-0">
                    <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-[#8A8A8A]">
                      Billing
                    </span>
                    <div
                      role="group"
                      aria-label="Billing cycle"
                      className="mt-2 flex rounded-[8px] border border-[rgba(255,255,255,0.12)] bg-[#111112] p-1"
                    >
                      {(["monthly", "hourly"] as const).map((option) => {
                        const isActive = billing === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setBilling(option)}
                            aria-pressed={isActive}
                            className={`relative h-8 rounded-[6px] px-4 font-sans text-[12.5px] font-medium capitalize outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[rgba(220,38,38,0.5)] ${
                              isActive ? "text-white" : "text-[#8A8A8A] hover:text-[#D4D4D4]"
                            }`}
                          >
                            {isActive ? (
                              <motion.span
                                layoutId="racko-billing-pill"
                                aria-hidden
                                className="absolute inset-0 rounded-[6px] bg-[#DC2626]"
                                transition={
                                  reduceMotion
                                    ? { duration: 0 }
                                    : { type: "spring", stiffness: 420, damping: 34 }
                                }
                              />
                            ) : null}
                            <span className="relative">{option}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8A8A8A]">
                  Resource Profile
                </p>

                <div className="group mt-2 flex items-center gap-3 rounded-[10px] border border-[rgba(255,255,255,0.09)] bg-[#111112] p-3.5 transition-colors duration-300 hover:border-[rgba(239,68,68,0.4)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.14)] transition-colors duration-300 group-hover:border-[rgba(239,68,68,0.5)]">
                    <SlidersHorizontal
                      className="h-4 w-4 text-[#D4D4D4] transition-colors duration-300 group-hover:text-[#EF4444]"
                      strokeWidth={1.7}
                      aria-hidden
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-[13px] font-semibold text-white">
                      Custom Configuration
                    </span>
                    <span className="mt-0.5 block font-sans text-[11.5px] text-[#8A8A8A]">
                      Choose vCPU, RAM and NVMe storage
                    </span>
                  </span>
                  <Link
                    href="/products/cloud-vps#configure"
                    className="shrink-0 rounded-[6px] border border-[rgba(255,255,255,0.14)] bg-[#1A1A1C] px-3 py-1.5 font-sans text-[11.5px] font-medium text-[#D4D4D4] transition-all duration-200 hover:border-[rgba(239,68,68,0.5)] hover:text-white"
                  >
                    Configure
                  </Link>
                </div>
              </div>
            </Column>

            <FlowArrow isActive={activeStep >= 2} reduceMotion={Boolean(reduceMotion)} delay={0.6} />

            <Column title="Review & Deploy" delay={0.34} isActive={activeStep === 2}>
              <div className="flex h-full flex-col rounded-[12px] border border-[rgba(255,255,255,0.09)] bg-[#0D0D0E] p-5">
                <span className="flex items-center gap-2">
                  <motion.span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#16A34A]"
                    animate={reduceMotion ? undefined : { opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#16A34A]">
                    Configuration Ready
                  </span>
                </span>

                <h3 className="mt-3 font-sans text-[19px] font-bold tracking-[-0.02em] text-white">
                  Cloud VPS
                </h3>

                <dl className="mt-4 flex flex-col gap-2.5">
                  <SummaryRow label="Region" value={region.label.toLowerCase()} />
                  <SummaryRow label="Price" value={price} />
                  <SummaryRow label="Billing" value={billing} />
                </dl>

                <div className="mt-auto pt-5">
                  <Link
                    href="/register"
                    className="group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-[8px] bg-[#DC2626] font-sans text-[13.5px] font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#EF4444] hover:shadow-[0_14px_34px_rgba(220,38,38,0.42)]"
                  >
                    {activeStep === 2 && !reduceMotion ? (
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)]"
                        initial={{ left: "-40%" }}
                        animate={{ left: "130%" }}
                        transition={{ duration: 0.65, ease: easeOut, delay: 0.1 }}
                      />
                    ) : null}
                    <span className="relative flex items-center gap-2">
                      Review &amp; Deploy
                      <ArrowRight
                        className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </span>
                  </Link>
                </div>
              </div>
            </Column>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, ease: easeOut, delay: 0.2 }}
          className="mt-8 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.09)] pt-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="font-sans text-[10.5px] uppercase tracking-[0.1em] text-[#8A8A8A]">
            New customer? Create your account during review.
          </p>
          <Link
            href="/login"
            className="font-sans text-[10.5px] uppercase tracking-[0.1em] text-[#8A8A8A] transition-colors duration-200 hover:text-[#F87171]"
          >
            Existing customer? Sign in and deploy.
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function Column({
  title,
  delay,
  isActive,
  children,
}: {
  title: ReactNode;
  delay: number;
  isActive: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: easeOut, delay }}
      className="flex min-w-0 flex-col"
    >
      <p
        className={`mb-2.5 font-sans text-[11.5px] transition-colors duration-300 ${
          isActive ? "text-white" : "text-[#8A8A8A]"
        }`}
      >
        {title}
      </p>
      <motion.div
        animate={{
          y: isActive ? -4 : 0,
          opacity: isActive ? 1 : 0.78,
          boxShadow: isActive
            ? "0 0 0 1px rgba(239,68,68,0.5), 0 18px 46px rgba(185,28,28,0.22)"
            : "0 0 0 0px rgba(239,68,68,0), 0 0px 0px rgba(185,28,28,0)",
        }}
        transition={{ duration: 0.35, ease: easeOut }}
        className="min-h-0 flex-1 rounded-[12px]"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8A8A8A]">{label}</dt>
      <dd className="min-w-0 overflow-hidden text-right">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={value}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: easeOut }}
            className="block truncate font-sans text-[12.5px] font-bold text-white"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </dd>
    </div>
  );
}

function FlowArrow({
  isActive,
  reduceMotion,
  delay,
}: {
  isActive: boolean;
  reduceMotion: boolean;
  delay: number;
}) {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: easeOut, delay: 0.3 }}
      className="flex shrink-0 items-center justify-center self-center py-1 lg:py-0 lg:pt-6"
    >
      <motion.span
        className="flex rotate-90 lg:rotate-0"
        animate={
          reduceMotion
            ? undefined
            : { x: isActive ? [0, 6, 0] : 0, scale: isActive ? 1.15 : 1 }
        }
        transition={
          isActive
            ? { x: { duration: 0.95, repeat: Infinity, ease: "easeInOut", delay }, scale: { duration: 0.28 } }
            : { duration: 0.28, ease: easeOut }
        }
      >
        <ArrowRight
          className={`h-5 w-5 transition-colors duration-300 ${
            isActive ? "text-[#EF4444]" : "text-[rgba(220,38,38,0.32)]"
          }`}
          strokeWidth={2}
        />
      </motion.span>
    </motion.span>
  );
}

function StepRail({ activeStep, reduceMotion }: { activeStep: number; reduceMotion: boolean }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
      <div className="flex min-w-[520px] items-center gap-3 px-4 py-9 sm:px-10 lg:px-16">
        {STEPS.map((step, index) => {
          const isDone = index < activeStep;
          const isActive = index === activeStep;
          const isFilled = isDone || isActive;

          return (
            <Fragment key={step.label}>
              {index > 0 ? (
                <span
                  aria-hidden
                  className="relative h-px flex-1 bg-[rgba(255,255,255,0.12)]"
                >
                  <motion.span
                    className="absolute inset-0 origin-left bg-[linear-gradient(90deg,#B91C1C,#EF4444)]"
                    initial={false}
                    animate={{ scaleX: isFilled ? 1 : 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.42, ease: easeOut }}
                  />
                  {isActive && !reduceMotion ? (
                    <motion.span
                      className="absolute top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-[#EF4444] shadow-[0_0_12px_rgba(239,68,68,0.9)]"
                      initial={{ left: "0%", opacity: 0 }}
                      animate={{ left: "100%", opacity: [0, 1, 1, 0] }}
                      transition={{ duration: 0.45, ease: easeOut }}
                    />
                  ) : null}
                </span>
              ) : null}

              <motion.span
                initial={{ opacity: 0, scale: 0.7 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, ease: easeOut, delay: 0.15 + index * 0.2 }}
                className="relative flex shrink-0 items-center justify-center"
              >
                <span
                  className={`absolute bottom-full mb-2.5 whitespace-nowrap font-sans text-[12.5px] font-semibold transition-colors duration-300 ${
                    isFilled ? "text-white" : "text-[#6B6B6B]"
                  }`}
                >
                  {step.label}
                </span>

                {isActive && !reduceMotion ? (
                  <motion.span
                    aria-hidden
                    className="absolute h-7 w-7 rounded-full border border-[rgba(239,68,68,0.6)]"
                    animate={{ scale: [1, 1.9], opacity: [0.65, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
                  />
                ) : null}

                <motion.span
                  animate={{ scale: isActive ? 1.12 : 1 }}
                  transition={{ type: "spring", stiffness: 360, damping: 22 }}
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full font-sans text-[11.5px] font-bold transition-colors duration-300 ${
                    isFilled
                      ? "bg-[#DC2626] text-white shadow-[0_0_18px_rgba(220,38,38,0.45)]"
                      : "border border-[rgba(255,255,255,0.16)] bg-[#0F0F10] text-[#8A8A8A]"
                  }`}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {isDone ? (
                      <motion.span
                        key="check"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.25, ease: easeOut }}
                        className="flex"
                      >
                        <Check className="h-[15px] w-[15px]" strokeWidth={2.6} aria-hidden />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="number"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.25, ease: easeOut }}
                      >
                        {index + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>

                <span
                  className={`absolute top-full mt-2.5 whitespace-nowrap font-sans text-[10px] transition-colors duration-300 ${
                    isFilled ? "text-[#9A9A9A]" : "text-[#5A5A5A]"
                  }`}
                >
                  {step.caption}
                </span>
              </motion.span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
