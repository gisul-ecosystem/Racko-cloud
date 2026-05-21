"use client";

import { useEffect, useRef } from "react";
import { motion, useAnimation, useInView } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";

const checklist = [
  "Compliance-ready operating model",
  "Data handling & sovereignty controls",
  "Audit support & evidence collection",
  "Policy guardrails across all layers",
  "Regional data sovereignty controls",
];

const securityPoints = [
  "Environment segmentation and data placement governance",
  "Role-based access with full audit trail across every layer",
  "Cross-environment observability and anomaly detection",
  "Redundancy architecture and operational continuity planning",
];

type SecuritySectionProps = {
  id?: string;
  fullDetail?: boolean;
};

export default function SecuritySection({
  id,
  fullDetail = false,
}: SecuritySectionProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const inView = useInView(widgetRef, { once: true, margin: "-80px" });
  const ringControls = useAnimation();
  const barControls = useAnimation();

  useEffect(() => {
    if (!inView) return;
    const timer = setTimeout(() => {
      ringControls.start({ strokeDashoffset: 26.4 });
      barControls.start((i: number) => ({
        width: `${[98, 94, 91][i]}%`,
        transition: { duration: 1, delay: i * 0.15, ease: "easeOut" },
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [inView, ringControls, barControls]);

  return (
    <section id={id} className="bg-bg-950 py-16 sm:py-20 lg:py-24">
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-10 px-4 sm:gap-12 sm:px-6 lg:grid-cols-2 lg:gap-16 xl:gap-20 xl:px-8">
        <div>
          <p
            className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-crimson-500"
          >
            SECURITY & GOVERNANCE
          </p>
          <h2 className="mt-3 max-w-[620px] font-sans text-[clamp(1.75rem,4vw,2.75rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-bg-50 md:text-[44px]">
            Confidence in how infrastructure is built, run, and controlled.
          </h2>
          <p className="mb-6 mt-6 max-w-[560px] text-base font-normal leading-[1.7] text-bg-400">
            Policy-first architecture. Audit-ready by default.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex-shrink-0 font-mono text-[12px] text-[#B91C1C]">
                {">"}
              </span>
              <span className="font-sans text-[14px] leading-[1.6] text-[#A1A1A1]">
                Environment segmentation and data placement governance across
                every workload boundary.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex-shrink-0 font-mono text-[12px] text-[#B91C1C]">
                {">"}
              </span>
              <span className="font-sans text-[14px] leading-[1.6] text-[#A1A1A1]">
                Role-based access with full audit trail across every
                infrastructure layer.
              </span>
            </div>
          </div>
          {fullDetail ? (
            <div className="space-y-4">
              {securityPoints.map((item) => (
                <p key={item} className="flex gap-3 text-[15px] leading-[1.6] text-bg-200">
                  <span className="font-mono shrink-0 font-medium text-bg-500">
                    &gt;
                  </span>
                  <span>{item}</span>
                </p>
              ))}
            </div>
          ) : (
            <Link
              href="#security"
              className="font-mono text-[13px] text-[#6B6B6B] transition-colors duration-150 hover:text-white"
            >
              Explore security & governance →
            </Link>
          )}
        </div>

        <motion.div
          ref={widgetRef}
          initial={{ opacity: 0, x: 32 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[#111111]"
        >
          <div className="flex h-9 items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-[#161616] px-[14px]">
            <div className="flex items-center gap-1.5">
              <span className="h-[6px] w-[6px] rounded-full bg-[rgba(255,255,255,0.15)]" />
              <span className="h-[6px] w-[6px] rounded-full bg-[rgba(255,255,255,0.15)]" />
              <span className="h-[6px] w-[6px] rounded-full bg-[rgba(255,255,255,0.15)]" />
            </div>
            <p className="font-mono text-[10px] tracking-[0.08em] text-[#3D3D3D]">
              racko · governance &amp; security
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className="h-[6px] w-[6px] rounded-full bg-[#16A34A]"
                style={{ animation: "pulse 2s ease-out infinite" }}
              />
              <span className="font-mono text-[9px] text-[#16A34A]">LIVE</span>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-6 bg-[#111111] p-4 sm:flex-row sm:items-center sm:p-6">
            <div className="relative mx-auto h-[100px] w-[100px] shrink-0 sm:mx-0">
              <svg viewBox="0 0 100 100" className="h-full w-full">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="8"
                />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#B91C1C"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="263.9"
                  initial={{ strokeDashoffset: 263.9 }}
                  animate={ringControls}
                  transform="rotate(-90 50 50)"
                  style={{ transition: "stroke-dashoffset 1.5s ease-out" }}
                />
                <text
                  x="50"
                  y="46"
                  textAnchor="middle"
                  fontFamily="var(--font-geist-sans)"
                  fontSize="20"
                  fontWeight="800"
                  fill="#FFFFFF"
                >
                  94
                </text>
                <text
                  x="50"
                  y="60"
                  textAnchor="middle"
                  fontFamily="var(--font-geist-mono)"
                  fontSize="8"
                  fill="#6B6B6B"
                >
                  /100
                </text>
              </svg>
            </div>
            <div className="flex-1">
              <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[#3D3D3D]">
                GOVERNANCE SCORE
              </p>
              <p className="mb-4 font-sans text-[13px] font-semibold text-white">
                Enterprise-ready posture
              </p>
              {[
                { name: "Access Control", value: "98" },
                { name: "Data Governance", value: "94" },
                { name: "Observability", value: "91" },
              ].map((row, idx) => (
                <div key={row.name} className="mb-2 flex items-center">
                  <span className="font-mono text-[10px] text-[#6B6B6B]">{row.name}</span>
                  <div className="mx-[10px] h-[3px] flex-1 rounded-[2px] bg-[rgba(255,255,255,0.06)]">
                    <motion.div
                      className="h-[3px] rounded-[2px] bg-[#B91C1C]"
                      initial={{ width: "0%" }}
                      animate={barControls}
                      custom={idx}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-white">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="h-px w-full bg-[rgba(255,255,255,0.06)]" />

          <div className="px-5 py-4">
            <div className="mb-[14px] flex items-center justify-between">
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#3D3D3D]">
                GOVERNANCE CHECKLIST
              </p>
              <span className="rounded-[3px] border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.1)] px-2 py-[2px] font-mono text-[9px] text-[#16A34A]">
                5/5 PASSED
              </span>
            </div>
            {checklist.map((item, idx) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: idx * 0.08 }}
                className={`flex items-center gap-2.5 py-[9px] ${idx < checklist.length - 1 ? "border-b border-[rgba(255,255,255,0.05)]" : ""}`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.1)]">
                  <Check size={10} color="#16A34A" strokeWidth={2.5} />
                </span>
                <p className="flex-1 font-sans text-[13px] leading-[1.4] text-[#A1A1A1]">{item}</p>
                <span className="font-mono text-[9px] text-[#3D3D3D]">VERIFIED</span>
              </motion.div>
            ))}
          </div>

          <div className="h-px w-full bg-[rgba(255,255,255,0.06)]" />

          <div className="px-5 py-[14px]">
            <p className="mb-[10px] font-mono text-[9px] uppercase tracking-[0.08em] text-[#3D3D3D]">
              RECENT EVENTS
            </p>
            {[
              { dot: "#16A34A", text: "Governance policy check — passed", time: "06:00 IST" },
              { dot: "#16A34A", text: "Access control audit — no violations", time: "08:30 IST" },
              { dot: "#16A34A", text: "Backup integrity verified", time: "09:00 IST" },
              { dot: "#D97706", text: "Patch available — review recommended", time: "09:45 IST" },
            ].map((event, idx) => (
              <motion.div
                key={event.text}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: 0.4 + idx * 0.06 }}
                className={`flex items-start gap-2.5 py-[7px] ${idx < 3 ? "border-b border-[rgba(255,255,255,0.04)]" : ""}`}
              >
                <span
                  className="mt-[5px] h-[6px] w-[6px] rounded-full"
                  style={{ backgroundColor: event.dot }}
                />
                <p className="flex-1 font-mono text-[11px] leading-[1.4] text-[#6B6B6B]">{event.text}</p>
                <span className="font-mono text-[9px] text-[#3D3D3D]">{event.time}</span>
              </motion.div>
            ))}
          </div>

          <div className="h-px w-full bg-[rgba(255,255,255,0.06)]" />

          <div className="flex items-center justify-between bg-[#161616] px-5 py-[10px]">
            <span className="font-mono text-[9px] text-[#3D3D3D]">
              Mumbai · Bare Metal · Managed
            </span>
            <Link
              href="/platform#security"
              className="font-mono text-[10px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
            >
              View full security report →
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
