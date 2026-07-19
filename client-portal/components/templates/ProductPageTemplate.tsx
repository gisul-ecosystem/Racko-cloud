"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useDemoModal } from "@/components/ui/DemoModalContext";
import {
  CLOUDLABS_PAGE_CONFIG_MAP,
  isCloudLabsSlug,
  type CloudLabsPageSlug,
} from "@/lib/cloudlabs-pages/configs";
import {
  PRODUCT_PAGE_CONFIG_MAP,
  type ProductPageSlug,
} from "@/lib/product-pages/configs";

const DEFAULT_HOW_IT_WORKS = [
  {
    step: "01",
    title: "Assess & design",
    description:
      "We review workload sizing, performance targets, and compliance needs—then recommend the right footprint.",
  },
  {
    step: "02",
    title: "Deploy & migrate",
    description:
      "Racko provisions your environment, executes migration, validates cutover, and hands over with clear runbooks.",
  },
  {
    step: "03",
    title: "Operate with confidence",
    description:
      "Monitoring, backup, governance, and 24/7 support keep production steady—with one accountable partner.",
  },
] as const;

const sectionView = { once: true, amount: 0.25 };
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: sectionView,
  transition: { duration: 0.45, ease: "easeOut" as const },
};

export type EnvironmentPageSlug = ProductPageSlug | CloudLabsPageSlug;

type ProductPageRouteProps = {
  slug: EnvironmentPageSlug;
};

export default function ProductPageTemplate({ slug }: ProductPageRouteProps) {
  const isCloudLabs = isCloudLabsSlug(slug);
  const config = isCloudLabs
    ? CLOUDLABS_PAGE_CONFIG_MAP[slug]
    : PRODUCT_PAGE_CONFIG_MAP[slug as ProductPageSlug];
  const {
    eyebrow,
    title,
    subtitle,
    positioningParagraphs,
    specs,
    bestFitChips,
    features,
    industryCards,
    howItWorks,
    deployCtaProductName,
  } = config;
  const { openModal } = useDemoModal();
  const steps = howItWorks?.length ? howItWorks : [...DEFAULT_HOW_IT_WORKS];

  return (
    <main className="min-w-0 bg-[#0A0A0A]">
      {/* 1. Hero */}
      <section className="bg-[#0A0A0A] pb-16 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#B91C1C]">
            {eyebrow}
          </p>
          <h1 className="mt-5 max-w-[920px] font-sans text-[clamp(36px,5vw,56px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white">
            {title}
          </h1>
          <p className="mt-6 max-w-[720px] font-sans text-[18px] font-normal leading-[1.65] text-[#6B6B6B]">
            {subtitle}
          </p>
          <button
            type="button"
            onClick={openModal}
            className="mt-8 inline-flex items-center gap-2 rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:bg-[#DC2626]"
          >
            Book a Racko Meet
            <span className="font-mono text-[14px]">→</span>
          </button>
        </div>
      </section>

      {/* 2. What it is */}
      <section className="bg-[#0E0E0E] py-20">
        <div className="mx-auto grid w-full max-w-[1280px] gap-12 px-6 md:grid-cols-2 md:gap-16 md:px-16">
          <motion.div {...fadeUp} className="min-w-0">
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#3D3D3D]">
              What it is
            </h2>
            <div className="mt-6 flex flex-col gap-5">
              {positioningParagraphs.map((p, idx) => (
                <p key={idx} className="font-sans text-[15px] font-normal leading-[1.75] text-[#A1A1A1]">
                  {p}
                </p>
              ))}
            </div>
          </motion.div>
          <motion.div {...fadeUp} className="min-w-0">
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#3D3D3D]">
              At a glance
            </h2>
            <ul className="mt-6 flex flex-col gap-3">
              {specs.map((line) => (
                <li key={line} className="flex gap-2 font-sans text-[13px] leading-[1.6] text-[#A1A1A1]">
                  <span className="shrink-0 font-mono text-[11px] text-[#B91C1C]">&gt;</span>
                  <span>{line.replace(/^>\s*/, "")}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* 3. Best fit workloads */}
      <section className="bg-[#0A0A0A] py-20">
        <div className="mx-auto w-full max-w-[1280px] px-6 text-center md:px-16">
          <motion.div {...fadeUp}>
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#3D3D3D]">
              Best fit workloads
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-2 sm:gap-3">
              {bestFitChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-2 font-mono text-[10px] text-[#A1A1A1]"
                >
                  {chip}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* 4. Key features */}
      <section className="bg-[#0E0E0E] py-20">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <motion.div {...fadeUp} className="text-center">
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#3D3D3D]">
              Key features
            </h2>
          </motion.div>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.Icon;
              return (
                <motion.div
                  key={f.title}
                  {...fadeUp}
                  className="rounded border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-6 py-7"
                >
                  <div className="mb-3 text-[#B91C1C]">
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
                  </div>
                  <h3 className="font-sans text-[16px] font-bold text-white">{f.title}</h3>
                  <p className="mt-2 font-sans text-[13px] leading-[1.6] text-[#6B6B6B]">{f.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. Use cases by industry */}
      <section className="bg-[#0A0A0A] py-20">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <motion.div {...fadeUp} className="text-center">
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#3D3D3D]">
              Use cases by industry
            </h2>
          </motion.div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {industryCards.map((card) => (
              <motion.div
                key={card.title}
                {...fadeUp}
                className="rounded border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-5 py-6 text-left"
              >
                <h3 className="font-sans text-[16px] font-bold text-white">{card.title}</h3>
                <p className="mt-2 font-sans text-[13px] leading-[1.6] text-[#6B6B6B]">{card.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. How it works */}
      <section className="bg-[#0E0E0E] py-20">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <motion.div {...fadeUp} className="text-center">
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#3D3D3D]">
              How it works
            </h2>
          </motion.div>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
            {steps.map((s, i) => (
              <motion.div
                key={s.step}
                initial={fadeUp.initial}
                whileInView={fadeUp.whileInView}
                viewport={fadeUp.viewport}
                transition={{ ...fadeUp.transition, delay: i * 0.05 }}
              >
                <p className="font-mono text-[11px] text-[#B91C1C]">{s.step}</p>
                <h3 className="mt-2 font-sans text-[18px] font-bold text-white">{s.title}</h3>
                <p className="mt-3 font-sans text-[14px] leading-[1.65] text-[#6B6B6B]">{s.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. CTA block */}
      <section className="bg-[#0A0A0A] py-20">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-center gap-[14px] px-6 text-center md:flex-row md:px-16">
          {isCloudLabs ? (
            <>
              <Link
                href="/products"
                className="inline-flex w-full items-center justify-center gap-2 rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-all duration-200 hover:bg-[#DC2626] md:w-auto"
              >
                Discover Racko Products
                <span className="font-mono text-[14px]">→</span>
              </Link>
              <Link
                href="/cloudlabs"
                className="inline-flex w-full items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.15)] bg-transparent px-8 py-3 font-sans text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)] md:w-auto"
              >
                View all CloudLabs →
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={openModal}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-all duration-200 hover:bg-[#DC2626] md:w-auto"
              >
                Book a Racko Meet
                <span className="font-mono text-[14px]">→</span>
              </button>
              <Link
                href="/products"
                className="inline-flex w-full items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.15)] bg-transparent px-8 py-3 font-sans text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)] md:w-auto"
              >
                Explore all products →
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Bottom ready block */}
      <section className="bg-[#0A0A0A] pb-24 pt-0">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-16">
          <div
            className={`mx-auto max-w-[800px] rounded-lg border border-[rgba(185,28,28,0.15)] bg-[rgba(185,28,28,0.06)] px-5 py-10 text-center sm:px-8 sm:py-11 md:px-12 md:py-12 lg:px-16 ${
              isCloudLabs ? "my-24" : "mt-20"
            }`}
          >
            <h3 className="font-sans text-[22px] font-bold text-white md:text-[24px]">
              {isCloudLabs ? "Ready to launch " : "Ready to deploy "}
              {deployCtaProductName}?
            </h3>
            <p className="mx-auto mt-4 max-w-[520px] font-sans text-[15px] leading-[1.65] text-[#A1A1A1]">
              {isCloudLabs ? (
                <>
                  Tell us what you need — Racko CloudLabs team will design and deploy the right environment.
                </>
              ) : (
                <>
                  Book a Racko Meet — our infrastructure specialists will assess your workload and recommend the right
                  configuration.
                </>
              )}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              {isCloudLabs ? (
                <>
                  <Link
                    href="/products"
                    className="inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-all duration-200 hover:bg-[#DC2626]"
                  >
                    Discover Racko Products
                    <span className="font-mono text-[14px]">→</span>
                  </Link>
                  <Link
                    href="/cloudlabs"
                    className="font-mono text-[12px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
                  >
                    ← View all CloudLabs
                  </Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={openModal}
                    className="inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-all duration-200 hover:bg-[#DC2626]"
                  >
                    Book a Racko Meet
                    <span className="font-mono text-[14px]">→</span>
                  </button>
                  <Link
                    href="/products"
                    className="font-mono text-[12px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
                  >
                    ← Back to all products
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
