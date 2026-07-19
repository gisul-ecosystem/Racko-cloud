"use client";

import { motion } from "framer-motion";

type BottomCTAProps = {
  /** Overrides first H2 line (default: V2.1 benchmark copy). */
  headline?: string;
  /** Overrides second H2 line (default: V2.1 design copy). */
  subline?: string;
};

const DEFAULT_LINE1 = "Benchmark the cloud SKU.";
const DEFAULT_LINE2 = "Design the environment. Then check Racko.";

const viewAnim = { once: true as const };
const ease = "easeOut" as const;

export default function BottomCTA({ headline, subline }: BottomCTAProps) {
  const line1 = headline ?? DEFAULT_LINE1;
  const line2 = subline ?? DEFAULT_LINE2;

  return (
    <section className="relative overflow-hidden px-6 py-16 text-center md:px-16 md:py-[120px]">
      {/* Layer 1 — base */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[#0A0A0A]" aria-hidden />

      {/* Layer 2 — primary radial glow */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 50% 120%, rgba(185,28,28,0.35) 0%, rgba(185,28,28,0.15) 35%, rgba(185,28,28,0.04) 60%, transparent 75%)",
        }}
        aria-hidden
      />

      {/* Layer 3 — side glows */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 40% 60% at 10% 100%, rgba(185,28,28,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 40% 60% at 90% 100%, rgba(185,28,28,0.12) 0%, transparent 60%)
          `,
        }}
        aria-hidden
      />

      {/* Layer 4 — grid texture */}
      <svg
        className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-[0.03]"
        aria-hidden
      >
        <defs>
          <pattern
            id="bottom-cta-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="#B91C1C"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bottom-cta-grid)" />
      </svg>

      {/* Layer 5 — top edge fade */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-0 h-[100px] bg-gradient-to-b from-[#0A0A0A] to-transparent"
        aria-hidden
      />

      <div className="relative z-[1] mx-auto max-w-[680px]">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewAnim}
          transition={{ duration: 0.5, ease, delay: 0 }}
          className="mb-5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#B91C1C]"
        >
          GET STARTED
        </motion.p>

        <h2 className="m-0 p-0">
          <motion.span
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewAnim}
            transition={{ duration: 0.5, ease, delay: 0.1 }}
            className="block font-sans text-[clamp(40px,4.5vw,60px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white"
          >
            {line1}
          </motion.span>

          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={viewAnim}
            transition={{ duration: 0.4, ease, delay: 0.2 }}
            className="mx-auto my-4 h-0.5 w-12 origin-center rounded-[1px] bg-[#B91C1C]"
            aria-hidden
          />

          <motion.span
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewAnim}
            transition={{ duration: 0.5, ease, delay: 0.2 }}
            className="block font-sans text-[clamp(40px,4.5vw,60px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-[rgba(255,255,255,0.4)]"
          >
            {line2}
          </motion.span>
        </h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewAnim}
          transition={{ duration: 0.5, ease, delay: 0.3 }}
          className="mx-auto mt-5 max-w-[540px] text-center font-sans text-[16px] font-normal leading-[1.7] text-[#6B6B6B]"
        >
          Before you finalize your next VPS, Dedicated Cloud, GPU, CloudLabs, storage, backup, or
          workload cloud decision, compare the market — then ask Racko for the final quote and
          deployment model.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewAnim}
          transition={{ duration: 0.5, ease, delay: 0.4 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-[14px]"
        >
          <a
            href="/assessment"
            className="inline-flex items-center justify-center rounded-[6px] border-0 bg-[#B91C1C] px-9 py-[14px] font-sans text-[15px] font-semibold text-white shadow-[0_0_32px_rgba(185,28,28,0.25)] transition-all duration-200 hover:-translate-y-[2px] hover:bg-[#DC2626] hover:shadow-[0_0_48px_rgba(185,28,28,0.4)]"
          >
            Book a Racko Meet →
          </a>
          <a
            href="/products"
            className="inline-flex items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.2)] bg-transparent px-9 py-[14px] font-sans text-[15px] font-semibold text-white transition-all duration-150 hover:border-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.06)]"
          >
            Discover Racko Products
          </a>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewAnim}
          transition={{ duration: 0.5, ease, delay: 0.5 }}
          className="mt-7 font-mono text-[10px] text-[#3D3D3D]"
        >
          No commitment. No sales deck. Just cloud.
        </motion.p>
      </div>
    </section>
  );
}
