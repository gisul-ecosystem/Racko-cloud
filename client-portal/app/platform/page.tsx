import ArchPreviewSection from "@/components/sections/ArchPreviewSection";
import BottomCTA from "@/components/sections/BottomCTA";
import ProcessSection from "@/components/sections/ProcessSection";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata = {
  title: "Platform — Racko",
  description:
    "One operating model across private, hybrid, and AI-ready infrastructure. Governed and managed for enterprise scale.",
};

const environmentPillars = [
  {
    label: "PRIVATE / LOCAL",
    title: "Bare Metal & Dedicated Compute",
    desc: "For latency-sensitive, data-sovereign, or compliance-heavy workloads demanding physical control and predictable performance.",
    features: [
      "Dedicated bare metal compute",
      "Physical network isolation",
      "On-site and co-location options",
      "No noisy-neighbour risk",
      "Full data placement control",
    ],
  },
  {
    label: "HYBRID / MULTI-CLOUD",
    title: "Cloud-Smart Workload Placement",
    desc: "Elasticity, managed services, and portability across AWS, Azure, GCP, and Oracle — unified under one governance and operations layer.",
    features: [
      "AWS, Azure, GCP, Oracle authorized",
      "Workload portability across providers",
      "Unified cost attribution",
      "Single control plane for all environments",
      "Cloud-to-private workload migration",
    ],
  },
  {
    label: "AI INFRASTRUCTURE",
    title: "GPU Clusters & Inference Environments",
    desc: "From model training to inference pipelines — purpose-built AI compute with the economics and governance to move from pilot to production.",
    features: [
      "H100 / A100 GPU cluster access",
      "Inference environment management",
      "MLOps pipeline integration",
      "Cost-per-token economics tracking",
      "Model serving and scaling",
    ],
  },
];

const managedOps = [
  {
    label: "PROVISIONING",
    desc: "Automated environment setup, configuration, and validation. New workloads deploy in hours, not months.",
  },
  {
    label: "MONITORING",
    desc: "24/7 cross-environment observability. Metrics, logs, traces, and anomaly detection in one operational view.",
  },
  {
    label: "LIFECYCLE",
    desc: "Patch management, capacity planning, hardware refresh cycles, and end-of-life coordination — managed continuously.",
  },
  {
    label: "INCIDENT RESPONSE",
    desc: "Defined SLAs, runbooks, and expert escalation paths. Your team gets notified, not paged.",
  },
];

export default function PlatformPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-16 pt-[120px] sm:pb-20 sm:pt-[140px] lg:pb-[100px] lg:pt-[160px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="PLATFORM" />
          <h1 className="mt-4 font-sans text-[clamp(2rem,8vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.03em] text-white md:text-[72px]">
            One operating model.
            <br />
            Every environment.
          </h1>
          <p className="mt-7 max-w-[600px] text-[20px] leading-[1.7] text-[#6B6B6B]">
            Private infrastructure. Hybrid cloud. AI-ready compute. All governed
            and operated as a single plane — so your team focuses on outcomes, not
            infrastructure.
          </p>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-[120px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <div className="grid grid-cols-1 gap-[1px] bg-[rgba(255,255,255,0.08)] lg:grid-cols-3">
            {environmentPillars.map((pillar) => (
              <article
                key={pillar.title}
                className="min-w-0 border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-5 py-10 sm:px-8 sm:py-12 lg:px-10"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">
                  {pillar.label}
                </p>
                <pre className="mb-6 mt-5 font-mono text-[9px] leading-[1.5] text-[#1E1E1E]">
{`........................
........................
........................
........................`}
                </pre>
                <h3 className="font-sans text-2xl font-bold text-white">
                  {pillar.title}
                </h3>
                <p className="mt-4 text-[15px] leading-[1.7] text-[#6B6B6B]">
                  {pillar.desc}
                </p>
                <div className="mt-6 space-y-2 font-mono text-xs text-[#3D3D3D]">
                  {pillar.features.map((feature) => (
                    <p key={feature}>
                      <span className="mr-1.5 text-crimson-500">&gt;</span>
                      {feature}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0A0A0A] py-[120px]">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-10 px-4 sm:gap-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:px-8">
          <div className="min-w-0">
            <Eyebrow label="MANAGED OPS" />
            <h2 className="mt-4 max-w-[700px] font-sans text-[38px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white md:text-[52px]">
              The operational layer your team shouldn&apos;t have to own.
            </h2>
            <p className="mt-6 max-w-[620px] text-base leading-[1.7] text-[#6B6B6B]">
              Every environment Racko manages comes with a full operational layer
              underneath it. Provisioning, monitoring, patching, incident response,
              and lifecycle management — handled.
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {managedOps.map((item) => (
              <article
                key={item.label}
                className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-7"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">
                  {item.label}
                </p>
                <p className="mt-3 text-sm leading-[1.7] text-[#6B6B6B]">
                  {item.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ProcessSection />

      <ArchPreviewSection id="architecture" docsHref="/platform#architecture" />

      <section className="border-y border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-4 py-6 sm:px-6 sm:py-7 xl:px-10">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#3D3D3D]">
            AUTHORIZED CLOUD PARTNERS
          </p>
          <div className="flex flex-wrap items-center gap-8 md:gap-12">
            {["AWS", "Azure", "GCP", "Oracle Cloud"].map((partner) => (
              <span
                key={partner}
                className="font-sans text-sm font-semibold text-[rgba(255,255,255,0.4)] transition-colors duration-150 hover:text-[rgba(255,255,255,0.8)]"
              >
                {partner}
              </span>
            ))}
          </div>
        </div>
      </section>

      <BottomCTA />
    </>
  );
}
