"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const environmentTypes = [
  "Hands-on cloud labs",
  "Self-provisioned workspaces",
  "AI / ML experiment environments",
  "Cloud sandboxes for POCs",
  "Customer pilot environments",
  "Hackathon & event environments",
  "LMS-integrated labs",
  "Skill validation environments",
  "Security / SSL lab sandboxes",
  "ERP / LMS SaaS demo environments",
  "Certification practice labs",
  "Bare metal / dedicated lab environments",
] as const;

const envRows = [
  { type: "LAB", name: "ml-training-cohort-12", status: "RUNNING" as const },
  { type: "SANDBOX", name: "ai-demo-client-xyz", status: "LAUNCHING" as const },
  { type: "EVENT", name: "hackathon-march-2025", status: "SCHEDULED" as const },
];

function StatusBadge({ status }: { status: "RUNNING" | "LAUNCHING" | "SCHEDULED" }) {
  if (status === "RUNNING") {
    return (
      <span className="rounded-[4px] border border-[rgba(22,163,74,0.25)] bg-[rgba(22,163,74,0.12)] px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-[#16A34A]">
        {status}
      </span>
    );
  }
  if (status === "LAUNCHING") {
    return (
      <span
        className="rounded-[4px] border border-[rgba(185,28,28,0.35)] bg-[rgba(185,28,28,0.12)] px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-[#B91C1C]"
        style={{ animation: "pulse 1.5s ease-out infinite" }}
      >
        {status}
      </span>
    );
  }
  return (
    <span className="rounded-[4px] border border-[rgba(217,119,6,0.3)] bg-[rgba(217,119,6,0.12)] px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-[#D97706]">
      {status}
    </span>
  );
}

export default function CloudLabsSection() {
  return (
    <section className="bg-[#0A0A0A] py-24">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mx-auto mb-16 max-w-[700px] text-center"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#B91C1C]">
            CLOUDLABS &amp; WORKSPACES
          </p>
          <h2 className="mt-4 font-sans text-[clamp(32px,5vw,52px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white">
            Launch governed cloud environments
            <br />
            in minutes — not days.
          </h2>
          <p className="mt-5 font-sans text-[17px] leading-[1.65] text-[#6B6B6B]">
            Self-provisioned labs, sandboxes, AI workspaces, demo environments, and event
            infrastructure — with cost guardrails, auto-cleanup, usage dashboards, and managed
            lifecycle support.
          </p>
        </motion.header>

        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.08 }}
          >
            <p className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-[#B91C1C]">
              ENVIRONMENT TYPES
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {environmentTypes.map((label) => (
                <li key={label} className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-[11px] text-[#B91C1C]">{">"}</span>
                  <span className="font-sans text-[13px] leading-snug text-[#A1A1A1]">{label}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Link
                href="/products"
                className="inline-flex items-center justify-center rounded-[5px] bg-[#B91C1C] px-7 py-[11px] font-sans text-[13px] font-medium text-white transition-all duration-150 hover:-translate-y-[1px] hover:bg-[#DC2626]"
              >
                Discover Racko Products →
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 48 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.12 }}
            className="overflow-hidden rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[#111111]"
          >
            <div className="border-b border-[rgba(255,255,255,0.08)] bg-[#161616] px-4 py-2.5 font-mono text-[9px] text-[#3D3D3D]">
              racko cloudlabs · control plane
            </div>

            <div className="p-5">
              <div className="flex flex-col gap-2">
                {envRows.map((row) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between gap-3 rounded-[6px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#B91C1C]">
                        {row.type}
                      </p>
                      <p className="truncate font-sans text-[13px] font-medium text-white">{row.name}</p>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { label: "ACTIVE LABS", value: "12" },
                  { label: "USERS", value: "847" },
                  { label: "AUTO-CLEANUP", value: "ON" },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-[4px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5"
                  >
                    <p className="font-mono text-[8px] uppercase tracking-[0.06em] text-[#3D3D3D]">
                      {m.label}
                    </p>
                    <p className="mt-1 font-sans text-[18px] font-extrabold text-white">{m.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-[rgba(255,255,255,0.06)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-mono text-[9px] leading-relaxed text-[#3D3D3D]">
                  Cost guardrails · Auto-cleanup · Usage reporting
                </p>
                <Link
                  href="/cloudlabs"
                  className="shrink-0 font-mono text-[9px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
                >
                  View portal →
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
