"use client";

import Link from "next/link";
import { motion } from "framer-motion";

type Value = "Yes" | "No" | "Limited" | "Sometimes";

const rows: Array<{
  capability: string;
  vmProvider: Value;
  cloudOnly: Value;
  racko: Value;
}> = [
  { capability: "Own/controlled infra", vmProvider: "Limited", cloudOnly: "No", racko: "Yes" },
  { capability: "Bare metal", vmProvider: "Sometimes", cloudOnly: "No", racko: "Yes" },
  { capability: "VPS", vmProvider: "Yes", cloudOnly: "Limited", racko: "Yes" },
  { capability: "Private cloud", vmProvider: "Limited", cloudOnly: "Sometimes", racko: "Yes" },
  { capability: "GPU-ready infrastructure", vmProvider: "Limited", cloudOnly: "Sometimes", racko: "Yes" },
  { capability: "Cloud-to-cloud migration", vmProvider: "No", cloudOnly: "Yes", racko: "Yes" },
  { capability: "Cloud-to-local migration", vmProvider: "No", cloudOnly: "Limited", racko: "Yes" },
  { capability: "Local-to-cloud migration", vmProvider: "No", cloudOnly: "Yes", racko: "Yes" },
  { capability: "Managed operations", vmProvider: "Limited", cloudOnly: "Yes", racko: "Yes" },
  { capability: "AI deployment support", vmProvider: "No", cloudOnly: "Limited", racko: "Yes" },
  { capability: "Backup / DR", vmProvider: "Limited", cloudOnly: "Sometimes", racko: "Yes" },
];

function ValueBadge({
  value,
  column,
}: {
  value: Value;
  column: "vmProvider" | "cloudOnly" | "racko";
}) {
  const isYes = value === "Yes";
  const isNo = value === "No";
  const isPartial = value === "Limited" || value === "Sometimes";

  const dotClass = isYes
    ? column === "racko"
      ? "bg-[#B91C1C]"
      : "bg-[rgba(255,255,255,0.6)]"
    : isNo
      ? "bg-[rgba(255,255,255,0.2)]"
      : "bg-[#D97706]";

  const textClass = isYes
    ? "text-white"
    : isNo
      ? "text-[#3D3D3D]"
      : isPartial
        ? "text-[#6B6B6B]"
        : "text-[#6B6B6B]";

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
      <span className={`font-sans text-[13px] ${textClass}`}>{value}</span>
    </span>
  );
}

export default function WhyRackoSection() {
  return (
    <section className="bg-[#0E0E0E] py-24">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
        <div className="mx-auto max-w-[900px] text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            WHY RACKO
          </p>
          <h2 className="mt-5 font-sans text-[36px] font-extrabold leading-[1.1] text-white md:text-[52px]">
            Most providers sell capacity.
            <br />
            Racko delivers infrastructure outcomes.
          </h2>
        </div>

        <div className="mx-auto mt-14 w-full max-w-[1100px] overflow-x-auto rounded-[4px] border border-[rgba(255,255,255,0.08)]">
          <div className="min-w-[820px]">
          <div className="grid grid-cols-[220px_1fr_1fr_1fr] border-b border-[rgba(255,255,255,0.08)] bg-[#1A1A1A]">
            <div className="px-5 py-4" />
            <div className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">
              Generic VM Provider
            </div>
            <div className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">
              Cloud-only Partner
            </div>
            <div className="bg-[rgba(185,28,28,0.10)] px-5 py-4 font-mono text-[10px] uppercase tracking-[0.08em] text-crimson-500">
              Racko
            </div>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.04 } },
            }}
          >
            {rows.map((row, index) => (
              <motion.div
                key={row.capability}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
                }}
                className={`grid grid-cols-[220px_1fr_1fr_1fr] border-b border-[rgba(255,255,255,0.06)] ${
                  index % 2 === 0 ? "bg-[#0E0E0E]" : "bg-[#161616]"
                }`}
              >
                <div className="px-5 py-4 font-sans text-[12px] font-medium text-white sm:text-[13px]">
                  {row.capability}
                </div>
                <div className="px-5 py-4">
                  <ValueBadge value={row.vmProvider} column="vmProvider" />
                </div>
                <div className="px-5 py-4">
                  <ValueBadge value={row.cloudOnly} column="cloudOnly" />
                </div>
                <div className="bg-[rgba(185,28,28,0.10)] px-5 py-4">
                  <ValueBadge value={row.racko} column="racko" />
                </div>
              </motion.div>
            ))}
          </motion.div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <p className="font-sans text-[16px] text-[#6B6B6B]">
            Every capability. One partner. One accountability model.
          </p>
          <Link
            href="/assessment"
            className="mt-4 inline-flex font-mono text-[13px] text-crimson-500 transition-colors duration-200 hover:text-crimson-400"
          >
            Get Infrastructure Assessment ?
          </Link>
        </div>
      </div>
    </section>
  );
}
