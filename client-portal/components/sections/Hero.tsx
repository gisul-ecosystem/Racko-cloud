"use client";

import { useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HeroProps } from "@/types";
import Button from "@/components/ui/Button";

type TabId = "assess" | "deploy" | "monitor";

const tabs: { id: TabId; label: string }[] = [
  { id: "assess", label: "ASSESS" },
  { id: "deploy", label: "DEPLOY" },
  { id: "monitor", label: "MONITOR" },
];

const capabilityItems = [
  "VPS",
  "Cloud VPS",
  "Dedicated Cloud",
  "GPU Cloud",
  "CloudLabs",
  "S3 Storage",
  "Backup Storage",
  "Managed Ops",
  "24/7 Support",
] as const;

const capabilityPillBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 12px",
  borderRadius: "4px",
  fontFamily: "var(--font-geist-mono)",
  fontSize: "10px",
  fontWeight: "500",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
  transition: "all 150ms",
};

function capabilityPillStyle(item: string): CSSProperties {
  if (item === "CloudLabs") {
    return {
      ...capabilityPillBase,
      background: "rgba(185,28,28,0.12)",
      border: "1px solid rgba(185,28,28,0.3)",
      color: "#FFFFFF",
    };
  }
  if (item === "GPU Cloud") {
    return {
      ...capabilityPillBase,
      background: "rgba(185,28,28,0.08)",
      border: "1px solid rgba(185,28,28,0.2)",
      color: "rgba(255,255,255,0.85)",
    };
  }
  return {
    ...capabilityPillBase,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.7)",
  };
}

const assessLines = [
  { type: "command", text: "racko assess --workload prod-database --cloud-fit" },
  { type: "spacer", text: "" },
  { type: "muted", text: "Analysing workload profile................" },
  { type: "muted", text: "Checking data sensitivity requirements..." },
  { type: "muted", text: "Evaluating latency constraints.............." },
  { type: "spacer", text: "" },
  { type: "header", text: "ASSESSMENT REPORT" },
  {
    type: "kv",
    label: "Workload type    ",
    value: "Stable / Production DB",
    valueClass: "text-white",
  },
  {
    type: "kv",
    label: "Recommended      ",
    value: "Bare Metal · Mumbai",
    valueClass: "text-white",
  },
  {
    type: "kv",
    label: "Cost delta       ",
    value: "-38% vs. current cloud",
    valueClass: "text-[#16A34A]",
  },
  {
    type: "kv",
    label: "Governance score ",
    value: "94 / 100",
    valueClass: "text-white",
  },
  {
    type: "kv",
    label: "Migration path   ",
    value: "Cloud → Racko Local",
    valueClass: "text-white",
  },
  { type: "spacer", text: "" },
  { type: "ready", text: "Ready for architecture review" },
] as const;

const deploySteps = [
  { status: "done", label: "Environment provisioned", time: "09:14:02" },
  { status: "done", label: "Network configured", time: "09:14:18" },
  { status: "done", label: "Storage attached", time: "09:14:31" },
  { status: "active", label: "OS image deployed", time: "09:15:03" },
  { status: "pending", label: "Security policy applied", time: "—" },
  { status: "pending", label: "Monitoring agent installed", time: "—" },
  { status: "pending", label: "Handover to managed ops", time: "—" },
] as const;

const monitorEvents = [
  {
    color: "#16A34A",
    text: "Backup completed — prod-db-mumbai",
    time: "02:00 IST",
  },
  {
    color: "#16A34A",
    text: "Governance policy check — passed",
    time: "06:00 IST",
  },
  {
    color: "#16A34A",
    text: "Health check — all services nominal",
    time: "09:00 IST",
  },
  {
    color: "#6B6B6B",
    text: "Patch available — ubuntu 24.04.1",
    time: "09:12 IST",
  },
  {
    color: "#16A34A",
    text: "Monitoring agent — heartbeat OK",
    time: "09:15 IST",
  },
] as const;

export default function Hero({ bgImage }: HeroProps) {
  const [activeTab, setActiveTab] = useState<TabId>("assess");

  const tabTransition = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.18, ease: "easeOut" as const },
  };

  return (
    <section className="relative flex min-h-[100svh] w-full min-w-0 flex-col overflow-x-hidden overflow-y-visible border-b border-[rgba(255,255,255,0.06)] bg-[#0E0E0E] pt-[68px]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[68px] z-0">
        {bgImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgImage}
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: "75% center" }}
            sizes="100vw"
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(14,14,14,1) 0%, rgba(14,14,14,1) 38%, rgba(14,14,14,0.85) 50%, rgba(14,14,14,0.35) 62%, rgba(14,14,14,0) 78%, rgba(14,14,14,0) 100%)",
          }}
        />
      </div>

      <div className="absolute right-12 top-24 z-[2] hidden items-center gap-2 md:flex">
        <span className="inline-flex h-9 items-center rounded-sm border border-[rgba(185,28,28,0.55)] bg-[rgba(20,8,8,0.75)] px-4 font-mono text-[11px] tracking-[0.08em] text-[#B91C1C]">
          INDIA INFRA NETWORK
        </span>
        <span className="inline-flex h-9 items-center rounded-sm border border-[rgba(255,255,255,0.1)] bg-[rgba(8,8,8,0.72)] px-4 font-mono text-[11px] tracking-[0.08em] text-[#6B6B6B]">
          MUM · NOI · CHN
        </span>
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col justify-start gap-3 px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6 xl:px-10">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="relative w-full max-w-[420px] shrink-0 overflow-hidden rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(10,10,10,0.82)] shadow-[0_0_30px_rgba(185,28,28,0.08)] backdrop-blur-[12px] sm:max-w-none md:w-[420px]"
          >
            <div className="pointer-events-none absolute right-0 top-0 h-10 w-10 border-r border-t border-[rgba(185,28,28,0.65)]" />
            <div className="flex h-10 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
              <div className="flex items-center gap-0">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`flex h-10 cursor-pointer items-center border-0 border-b-2 bg-transparent px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] transition-[color,border-color] duration-150 sm:px-[14px] sm:text-[11px] sm:tracking-[0.08em] ${
                      activeTab === t.id
                        ? "border-b-2 border-[#B91C1C] text-[#B91C1C]"
                        : "border-b-2 border-transparent text-[#6B6B6B] hover:text-[#A1A1A1]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-12 rounded bg-[rgba(255,255,255,0.15)]" />
                <div className="h-2 w-2.5 rounded-sm bg-[rgba(255,255,255,0.15)]" />
              </div>
            </div>

            <div className="min-h-0 p-3 md:min-h-[240px] md:p-4">
              <AnimatePresence mode="wait">
                {activeTab === "assess" && (
                  <motion.div
                    key="assess"
                    variants={{
                      hidden: {},
                      animate: { transition: { staggerChildren: 0.07 } },
                    }}
                    initial="hidden"
                    animate="animate"
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="flex flex-col gap-0.5 overflow-x-auto font-mono text-[11px] leading-[1.65] md:text-xs md:leading-[1.8]"
                  >
                    {assessLines.map((line, idx) => (
                      <motion.div
                        key={`${line.type}-${idx}`}
                        variants={{
                          hidden: { opacity: 0 },
                          animate: { opacity: 1, transition: { duration: 0.25 } },
                        }}
                      >
                        {line.type === "command" ? (
                          <>
                            <span className="text-[#B91C1C]">$</span>{" "}
                            <span className="text-[rgba(255,255,255,0.9)]">{line.text}</span>
                          </>
                        ) : null}
                        {line.type === "spacer" ? <div className="h-0.5" aria-hidden /> : null}
                        {line.type === "muted" ? (
                          <span className="text-[#6B6B6B]">{line.text}</span>
                        ) : null}
                        {line.type === "header" ? (
                          <span className="text-[#3D3D3D]">{line.text}</span>
                        ) : null}
                        {line.type === "kv" ? (
                          <>
                            <span className="text-[#6B6B6B]">{line.label}</span>
                            <span className={line.valueClass}>{line.value}</span>
                          </>
                        ) : null}
                        {line.type === "ready" ? (
                          <>
                            <span className="text-[#B91C1C]">{">"}</span>{" "}
                            <span className="text-white">{line.text}</span>
                          </>
                        ) : null}
                      </motion.div>
                    ))}
                  </motion.div>
                )}
                {activeTab === "deploy" && (
                  <motion.div key="deploy" {...tabTransition}>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className="rounded-[3px] border border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.12)] px-2.5 py-[3px] font-mono text-[10px] text-[#B91C1C]">
                        BARE METAL · MUMBAI
                      </span>
                      <span className="rounded-[3px] border border-[rgba(22,163,74,0.3)] bg-[rgba(22,163,74,0.12)] px-2.5 py-[3px] font-mono text-[10px] text-[#16A34A]">
                        PROVISIONING
                      </span>
                    </div>
                    <div className="flex flex-col">
                      {deploySteps.map((step) => (
                        <div
                          key={step.label}
                          className="flex items-center gap-2.5 border-b border-[rgba(255,255,255,0.05)] py-2.5"
                        >
                          <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                            {step.status === "done" ? (
                              <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#16A34A] font-mono text-[7px] text-[#0A0A0A]">
                                ✓
                              </span>
                            ) : null}
                            {step.status === "active" ? (
                              <span
                                className="h-[6px] w-[6px] rounded-full bg-[#B91C1C]"
                                style={{ animation: "pulse 1.5s ease-out infinite" }}
                              />
                            ) : null}
                            {step.status === "pending" ? (
                              <span className="h-3 w-3 rounded-full border border-[rgba(255,255,255,0.1)]" />
                            ) : null}
                          </span>
                          <span
                            className={`flex-1 font-mono text-[11px] ${
                              step.status === "done"
                                ? "text-[#16A34A]"
                                : step.status === "active"
                                  ? "text-white"
                                  : "text-[#3D3D3D]"
                            }`}
                          >
                            {step.label}
                          </span>
                          <span className="font-mono text-[10px] text-[#3D3D3D]">
                            {step.time}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
                {activeTab === "monitor" && (
                  <motion.div key="monitor" {...tabTransition}>
                    <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <div className="rounded-[3px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2">
                        <p className="font-mono text-[8px] text-[#3D3D3D]">UPTIME</p>
                        <p className="font-sans text-[16px] font-bold text-white">99.98%</p>
                      </div>
                      <div className="rounded-[3px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2">
                        <p className="font-mono text-[8px] text-[#3D3D3D]">CPU</p>
                        <p className="font-sans text-[16px] font-bold text-white">23%</p>
                      </div>
                      <div className="rounded-[3px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2">
                        <p className="font-mono text-[8px] text-[#3D3D3D]">ALERTS</p>
                        <p className="font-sans text-[16px] font-bold text-[#16A34A]">0</p>
                      </div>
                    </div>
                    <p className="mb-2 font-mono text-[8px] tracking-[0.08em] text-[#3D3D3D]">
                      RECENT EVENTS
                    </p>
                    <div className="flex flex-col">
                      {monitorEvents.map((event) => (
                        <div
                          key={event.text}
                          className="flex min-w-0 items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.04)] py-2"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className="h-[5px] w-[5px] shrink-0 rounded-full"
                              style={{ backgroundColor: event.color }}
                            />
                            <span className="min-w-0 break-words font-mono text-[10px] text-[#A1A1A1]">
                              {event.text}
                            </span>
                          </div>
                          <span className="shrink-0 font-mono text-[9px] text-[#3D3D3D]">
                            {event.time}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="font-mono text-[9px] text-[#3D3D3D]">
                        Mumbai · Bare Metal · Managed
                      </span>
                      <span className="font-mono text-[9px] text-[#B91C1C]">
                        View dashboard →
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          <div className="mt-3 grid min-h-0 w-full min-w-0 grid-cols-1 items-end gap-5 md:mt-4 md:grid-cols-1 md:gap-10 lg:gap-12">
            <div className="flex min-h-0 min-w-0 flex-col">
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" as const, delay: 0 }}
                className="font-sans text-[clamp(44px,5vw,64px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white"
              >
                Racko Cloud Infrastructure
                <br />
                <span className="text-[#B91C1C]">Is Your Solution</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" as const, delay: 0.12 }}
                className="mt-3 max-w-[640px] font-sans text-[15px] font-normal leading-[1.65] text-[#6B6B6B] sm:mt-4 sm:max-w-[720px] sm:text-[16px]"
              >
                Racko delivers VPS, Cloud VPS, Dedicated Servers, Dedicated Cloud,
                Private Cloud, GPU Cloud, CloudLabs, S3-compatible storage, backup
                storage, and managed cloud operations — built for enterprises and
                high-growth teams that need performance, control, and predictable
                economics.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" as const, delay: 0.22 }}
                className="mt-4 flex w-full min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap md:mt-5 md:gap-3"
              >
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  arrow
                  href="/assessment"
                  className="w-full justify-center sm:w-auto"
                >
                  Book a Racko Meet
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  href="/products"
                  className="w-full justify-center rounded-[5px] border !border-white bg-transparent px-7 py-[11px] font-sans text-[14px] text-[#A1A1A1] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-white sm:w-auto"
                >
                  Explore Racko Products
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" as const, delay: 0.28 }}
                className="mt-5 flex w-full min-w-0 max-w-full flex-nowrap items-center gap-[6px] overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label="Product capabilities available on Racko"
              >
                <span
                  className="shrink-0 whitespace-nowrap font-mono text-[9px] text-[#3D3D3D]"
                  style={{ marginRight: 8 }}
                >
                  AVAILABLE ON RACKO:
                </span>
                {capabilityItems.map((item) => (
                  <span key={item} style={capabilityPillStyle(item)}>
                    {item}
                  </span>
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
