import type { Metadata } from "next";
import BottomCTA from "@/components/sections/BottomCTA";

export const metadata: Metadata = {
  title: "Migration — Racko",
  description:
    "Migrate workloads in any direction — cloud to local, local to cloud, cloud to cloud, VM provider to Racko, or AI workload deployment.",
};

const pathwayPills = [
  { label: "Cloud to Racko", href: "#cloud-to-racko" },
  { label: "Local to Cloud", href: "#local-to-cloud" },
  { label: "Cloud to Cloud", href: "#cloud-to-cloud" },
  { label: "VM to Racko", href: "#vm-to-racko" },
  { label: "AI Workload Deployment", href: "#ai-workload" },
];

const factorySteps = ["Assess", "Architect", "Migrate", "Secure", "Operate"];

type Pathway = {
  id: string;
  number: string;
  title: string;
  whenToUse: string;
  body: string;
  outcome: string;
  steps: string[];
};

const pathways: Pathway[] = [
  {
    id: "cloud-to-racko",
    number: "01",
    title: "Cloud to Racko",
    whenToUse:
      "When cloud cost is rising, workloads are stable, or data needs stronger control.",
    body: "Moving stable or cost-predictable workloads from AWS, Azure, or GCP to Racko's controlled local infrastructure reduces variable billing exposure and brings data closer to your operations — without sacrificing managed operations capability.",
    outcome:
      "Lower cost exposure, stronger data control, predictable infrastructure economics with full managed ops handover.",
    steps: [
      "Workload discovery and cost attribution analysis",
      "Identify migration candidates — stable, sensitive, latency-heavy",
      "Architecture design for local infra target state",
      "Data migration and workload cutover planning",
      "Go-live with zero-downtime cutover execution",
      "Managed operations handover — monitoring, governance, backup",
    ],
  },
  {
    id: "local-to-cloud",
    number: "02",
    title: "Local to Cloud",
    whenToUse:
      "When the business wants modernization, elasticity, or cloud-native services without forcing a full cloud-first mandate.",
    body: "Racko assesses which on-prem workloads are candidates for cloud lift-shift or refactor, designs the target cloud architecture, and manages the migration with risk controls. We stay on as the managed operations layer post-migration.",
    outcome:
      "Modernized workloads, cloud elasticity, and managed operations — without losing infrastructure accountability.",
    steps: [
      "Current-state infrastructure audit",
      "Workload classification — lift-shift vs refactor vs retire",
      "Target cloud architecture design (AWS / Azure / GCP / Oracle)",
      "Migration wave planning and dependency mapping",
      "Cutover execution with rollback procedures",
      "Post-migration ops — monitoring, cost governance, optimization",
    ],
  },
  {
    id: "cloud-to-cloud",
    number: "03",
    title: "Cloud to Cloud",
    whenToUse:
      "When Azure to AWS, GCP to Azure, or any cross-cloud migration is needed due to cost, performance, governance, or service availability.",
    body: "Cross-cloud migrations carry hidden complexity — account structures, networking topology, identity federation, data transfer costs, and service mapping. Racko manages the full migration with architecture continuity and zero production disruption.",
    outcome:
      "Target cloud environment running with mapped services, migrated data, and a consistent governance layer.",
    steps: [
      "Source cloud audit — accounts, services, costs, dependencies",
      "Target cloud architecture design and service mapping",
      "Identity and networking bridge setup",
      "Data migration with validation checkpoints",
      "Application cutover in defined migration waves",
      "Source cloud decommission and cost exit confirmation",
    ],
  },
  {
    id: "vm-to-racko",
    number: "04",
    title: "VM Provider to Racko",
    whenToUse:
      "When the current vendor only provides capacity — no migration support, backup, DR, managed ops, or lifecycle management.",
    body: "Generic VM providers hand you compute and walk away. Racko replaces the capacity layer with a full infrastructure and operations model — same workloads, better governance, managed lifecycle, and one accountable partner.",
    outcome:
      "Workloads on Racko infrastructure with managed operations, backup/DR, monitoring, and lifecycle support.",
    steps: [
      "Workload inventory and dependency mapping",
      "Racko infrastructure sizing and target state design",
      "VPS / bare metal / private cloud environment provisioning",
      "Data migration and workload replication setup",
      "Cutover execution with validation testing",
      "Managed ops activation — monitoring, backup, governance",
    ],
  },
  {
    id: "ai-workload",
    number: "05",
    title: "AI Workload Deployment",
    whenToUse:
      "When AI pilots need production environments, GPU cost-performance control, and training/inference architecture support.",
    body: "AI workloads have unique infrastructure requirements — GPU access, high-throughput storage, low-latency networking, and inference environment management. Racko designs, provisions, and operates AI infrastructure from pilot to production scale.",
    outcome:
      "Production AI environment with GPU compute, inference management, cost attribution, and managed operations.",
    steps: [
      "AI workload assessment — model type, data volume, inference load",
      "GPU infrastructure sizing and environment design",
      "Training environment provisioning and pipeline setup",
      "Inference environment deployment and latency testing",
      "Cost-per-inference attribution model setup",
      "Managed ops — monitoring, scaling, model lifecycle",
    ],
  },
];

export default function MigrationPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-[100px] pt-[160px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            MIGRATION
          </p>
          <h1 className="mt-5 font-sans text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] text-white md:text-[56px] lg:text-[72px]">
            Migrate workloads based on
            <br />
            business fit — not vendor lock-in.
          </h1>
          <p className="mt-6 max-w-[600px] font-sans text-[18px] font-normal leading-[1.7] text-[#6B6B6B] md:text-[20px]">
            Racko supports infrastructure migration in every direction. Cloud to
            local. Local to cloud. Cloud to cloud. VM provider to Racko. AI
            workload deployment. Each pathway has a defined process, risk
            controls, and a managed operations handover.
          </p>

          <div className="mt-10 flex flex-wrap gap-2">
            {pathwayPills.map((pill) => (
              <a
                key={pill.label}
                href={pill.href}
                className="rounded-[3px] border border-[rgba(255,255,255,0.1)] bg-[#1A1A1A] px-4 py-2 font-mono text-[10px] text-[#6B6B6B] transition-colors duration-200 hover:border-crimson-500 hover:text-white"
              >
                {pill.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-6 py-8 xl:px-16">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">
            RACKO MIGRATION FACTORY
          </p>
          <div className="flex flex-wrap items-center gap-3 lg:gap-5">
            {factorySteps.map((step, idx) => (
              <div key={step} className="flex items-center gap-3 lg:gap-5">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#3D3D3D]">
                    STEP {idx + 1}
                  </p>
                  <p className="mt-1 font-sans text-[14px] font-semibold text-white">
                    {step}
                  </p>
                </div>
                {idx < factorySteps.length - 1 ? (
                  <span className="font-mono text-[13px] text-[#3D3D3D]">→</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {pathways.map((pathway, index) => (
        <section
          key={pathway.id}
          id={pathway.id}
          className={`border-t border-[rgba(255,255,255,0.06)] py-[100px] ${
            index % 2 === 0 ? "bg-[#0E0E0E]" : "bg-[#0A0A0A]"
          }`}
        >
          <div className="mx-auto grid w-full max-w-[1280px] gap-12 px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-20 xl:px-8">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-crimson-500">
                {pathway.number}
              </p>
              <h2 className="mt-4 font-sans text-[34px] font-extrabold leading-[1.1] text-white md:text-[40px]">
                {pathway.title}
              </h2>
              <p className="mt-2 font-sans text-[16px] italic text-[#6B6B6B]">
                {pathway.whenToUse}
              </p>
              <p className="mt-5 font-sans text-[15px] leading-[1.7] text-[#6B6B6B]">
                {pathway.body}
              </p>

              <div className="mt-8 rounded-r-[4px] border-l-2 border-crimson-500 bg-[#1A1A1A] px-5 py-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">
                  OUTCOME
                </p>
                <p className="mt-1.5 font-sans text-[14px] text-white">
                  {pathway.outcome}
                </p>
              </div>
            </div>

            <div className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-8">
              <p className="mb-5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#3D3D3D]">
                MIGRATION STEPS
              </p>
              <div>
                {pathway.steps.map((step, stepIndex) => (
                  <div
                    key={step}
                    className={`flex gap-3.5 py-3.5 ${
                      stepIndex < pathway.steps.length - 1
                        ? "border-b border-[rgba(255,255,255,0.06)]"
                        : ""
                    }`}
                  >
                    <span className="shrink-0 font-mono text-[11px] text-crimson-500">
                      {`0${stepIndex + 1}`}
                    </span>
                    <p className="font-sans text-[13px] text-[#A1A1A1]">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}

      <BottomCTA headline="Start with a migration assessment." />
    </>
  );
}
