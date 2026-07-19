"use client";

import Link from "next/link";

const capabilities = [
  {
    label: "PRIVATE / LOCAL",
    title: "Bare Metal & Dedicated Compute",
  },
  {
    label: "HYBRID / MULTI-CLOUD",
    title: "Cloud-Smart Placement",
  },
  {
    label: "AI INFRASTRUCTURE",
    title: "GPU & Inference Environments",
  },
  {
    label: "MANAGED OPS",
    title: "Provisioning & Lifecycle",
  },
];

type PlatformSectionProps = {
  id?: string;
};

export default function PlatformSection({ id }: PlatformSectionProps) {
  return (
    <section id={id} className="bg-bg-950 py-[56px] md:py-[72px] xl:py-[120px]">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
        <div className="mx-auto mb-20 max-w-[640px] text-center">
          <p
            className="font-mono mb-5 text-[11px] font-medium uppercase tracking-[0.1em] text-crimson-500"
          >
            PLATFORM
          </p>
          <h2 className="font-sans text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] text-bg-50 md:text-[46px] lg:text-[52px]">
            One operating model. Every environment.
          </h2>
          <p className="mx-auto mt-5 max-w-[620px] text-[18px] font-normal leading-[1.7] text-bg-400">
            Private infrastructure. Hybrid cloud. AI-ready compute. Governed
            and managed as a single operational plane.
          </p>
        </div>

        <div className="border border-[rgba(255,255,255,0.08)] bg-bg-800">
          <div className="grid grid-cols-1 md:grid-cols-4">
            {capabilities.map((capability, idx) => (
              <div
                key={capability.title}
                className={`px-7 py-8 ${
                  idx < capabilities.length - 1
                    ? "border-b border-[rgba(255,255,255,0.08)] md:border-b-0 md:border-r"
                    : ""
                } border-[rgba(255,255,255,0.08)]`}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">
                  {capability.label}
                </p>
                <h3 className="mt-3 font-sans text-base font-bold text-bg-50">
                  {capability.title}
                </h3>
              </div>
            ))}
          </div>
          <div className="border-t border-[rgba(255,255,255,0.08)] px-7 py-5 text-center md:text-left">
            <Link
              href="#platform"
              className="font-mono text-[13px] text-[#6B6B6B] transition-colors duration-150 hover:text-white"
            >
              Explore the platform →
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5 border-y border-[rgba(255,255,255,0.08)] bg-bg-800 px-10 py-7 lg:flex-row lg:items-center lg:justify-between">
          <p className="font-mono text-[11px] font-medium text-bg-400">
            Authorized cloud partners
          </p>
          <div className="flex flex-wrap items-center gap-8">
            {["AWS", "Azure", "GCP", "Oracle Cloud"].map((partner) => (
              <span
                key={partner}
                className="font-sans text-[13px] font-bold text-bg-400"
              >
                {partner}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
