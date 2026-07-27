import type { Metadata } from "next";
import BottomCTA from "@/components/sections/BottomCTA";
import Button from "@/components/ui/Button";
import UseCaseBlock from "@/components/ui/UseCaseBlock";

export const metadata: Metadata = {
  title: "BPO & KPO Infrastructure Use Cases — Racko",
  description:
    "Infrastructure for LMS platforms, CloudLabs, assessment systems, GenAI learning environments, and hire-train-deploy factories.",
};

const useCases = [
  {
    number: "3.1",
    title: "Voice AI Infrastructure for Contact Center Automation",
    archetypes:
      "Go4customer, Maxicus, [24]7.ai-style CX platforms, Venturesathi",
    columns: {
      industryReq: [
        "Voice AI programs require low-latency speech pipelines, call routing reliability, and high-concurrency session handling.",
        "Automation flows need stable infrastructure for ASR, NLU, orchestration, and integration with CRM systems.",
      ],
      challengesSolved: [
        "Speech latency affecting call experience",
        "Session drops during campaign spikes",
        "Inconsistent routing behavior under high load",
        "High cost for always-on voice workloads",
        "Limited observability across call and AI layers",
      ],
      rackoStack: [
        "Bare metal and VPS tiers for real-time voice services",
        "Private cloud lanes for secure CX integrations",
        "Scalable media and orchestration infrastructure",
        "Monitoring for call quality, latency, and drop rates",
        "Managed operations for uptime and incident response",
      ],
      outcomes: [
        "25–40% improvement in call automation response quality",
        "20–35% reduction in call-session failure rates",
        "Lower latency variability in high-concurrency windows",
        "Reduced infrastructure cost volatility for voice workloads",
        "Improved CX platform reliability during campaign peaks",
      ],
    },
  },
  {
    number: "3.2",
    title: "Omnichannel CX Platform Infrastructure",
    archetypes: "Maxicus, [24]7.ai, mid-sized CX outsourcing providers",
    columns: {
      industryReq: [
        "Omnichannel operations require stable infrastructure for voice, chat, email, social, and workflow orchestration.",
        "CX teams need unified data and real-time operational visibility across channels.",
      ],
      challengesSolved: [
        "Channel-wise scaling mismatch during demand surges",
        "Delayed response due to backend bottlenecks",
        "Fragmented infrastructure across communication stacks",
        "Weak reporting consistency across channels",
        "Operational overhead in managing mixed workloads",
      ],
      rackoStack: [
        "Hybrid cloud for burst-ready channel workloads",
        "VPS pools for middleware, queues, and integrations",
        "Private cloud for sensitive customer data flows",
        "Observability for throughput, queue lag, and failures",
        "Managed operations for release and lifecycle management",
      ],
      outcomes: [
        "30–45% better handling of multichannel concurrency",
        "Faster response consistency across customer touchpoints",
        "Lower support escalations tied to infra instability",
        "Improved reporting and operational decision speed",
        "More predictable scaling for campaign-driven workloads",
      ],
    },
  },
  {
    number: "3.3",
    title: "KPO Analytics and Research Data Processing Infrastructure",
    archetypes:
      "Go4customer-style KPOs, analytics outsourcing firms, market research providers",
    columns: {
      industryReq: [
        "KPO teams require dependable compute for high-volume analytics, report generation, and client-specific data workflows.",
        "Data processing stacks must support secure storage, retention, and governed access across projects.",
      ],
      challengesSolved: [
        "Slow analytics turnaround due to shared infrastructure contention",
        "Inconsistent performance in heavy batch windows",
        "Data handling risk in multi-client environments",
        "Weak governance on data lifecycle and archival",
        "Rising cost for long-running processing workloads",
      ],
      rackoStack: [
        "Bare metal compute for heavy analytics jobs",
        "Private cloud segmentation by client/project",
        "Storage and archival layers with policy controls",
        "Monitoring for batch performance and failure trends",
        "Managed operations for backup, DR, and governance",
      ],
      outcomes: [
        "25–40% faster analytics processing windows",
        "Improved predictability for client report delivery timelines",
        "Stronger governance for sensitive client datasets",
        "Reduced infra-related rework in research operations",
        "Lower cost variance for recurring analytics workloads",
      ],
    },
  },
  {
    number: "3.4",
    title: "Agent Desktop and Workforce Productivity Infrastructure",
    archetypes: "Mid-sized domestic BPOs, outsourced sales/support teams",
    columns: {
      industryReq: [
        "Agent operations need stable virtual desktop and application infrastructure with session reliability at scale.",
        "Teams require secure and repeatable environments for onboarding, QA, and daily operations.",
      ],
      challengesSolved: [
        "Desktop/session instability affecting agent productivity",
        "Slow environment provisioning for new batches",
        "Inconsistent app performance across teams",
        "Weak visibility into endpoint and infra health",
        "High support overhead for recurring setup issues",
      ],
      rackoStack: [
        "VPS pools for agent desktop workloads",
        "Template-based environment provisioning",
        "Private network controls for customer data paths",
        "Operational monitoring for availability and response",
        "Managed setup, patching, and lifecycle support",
      ],
      outcomes: [
        "40–60% faster onboarding environment readiness",
        "20–35% improvement in agent uptime consistency",
        "Reduced productivity loss from infra disruptions",
        "Lower support ticket volume from setup instability",
        "Better quality assurance consistency across teams",
      ],
    },
  },
  {
    number: "3.5",
    title: "Compliance and Call Recording Archive Infrastructure",
    archetypes: "BFSI support BPOs, healthcare BPOs, collections operations",
    columns: {
      industryReq: [
        "Regulated BPO operations require secure retention infrastructure for call recordings, logs, and evidence trails.",
        "Compliance workflows need fast retrieval and controlled access for audits and investigations.",
      ],
      challengesSolved: [
        "Storage growth stress from large recording volumes",
        "Slow retrieval during compliance checks",
        "Weak retention governance and deletion controls",
        "Risk of data loss without tested DR design",
        "High operational effort for archive management",
      ],
      rackoStack: [
        "Tiered storage architecture for archive workloads",
        "Policy-based retention and lifecycle controls",
        "Backup / DR for recordings and compliance logs",
        "Private cloud controls for regulated data access",
        "Managed monitoring and audit retrieval support",
      ],
      outcomes: [
        "50–70% faster retrieval for audit and legal requests",
        "Improved retention governance and policy compliance",
        "Reduced risk of archive integrity failures",
        "Lower operational overhead in long-term storage management",
        "Higher confidence for regulated client workloads",
      ],
    },
  },
];

export default function BpoKpoUseCasesPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            BPO / KPO
          </p>
          <h1 className="mt-5 font-sans text-[40px] font-extrabold leading-[1.04] tracking-[-0.03em] text-white md:text-[56px] lg:text-[64px]">
            Infrastructure for BPO and KPO operations.
          </h1>
          <p className="mt-6 max-w-[560px] font-sans text-[18px] leading-[1.7] text-[#6B6B6B]">
            Voice AI, omnichannel CX, analytics, agent desktop, and compliance
            archive infrastructure — for contact centres, research operations,
            and regulated outsourcing teams.
          </p>
          <p className="mt-6 text-center font-mono text-[10px] text-[#3D3D3D]">
            Reference archetypes are industry examples, not Racko client claims.
            Outcome ranges are targets based on workload assessments.
          </p>
        </div>
      </section>

      {useCases.map((item, idx) => (
        <UseCaseBlock
          key={item.number}
          number={item.number}
          title={item.title}
          archetypes={item.archetypes}
          columns={item.columns}
          background={idx % 2 === 0 ? "#0E0E0E" : "#0A0A0A"}
        />
      ))}

      <section className="border-y border-[rgba(255,255,255,0.08)] bg-[#161616] px-6 py-12 xl:px-16">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-sans text-[20px] font-bold text-white">
              Running a contact centre, KPO, or outsourced operations team?
            </p>
            <p className="mt-1.5 font-sans text-[14px] text-[#6B6B6B]">
              Tell us about one priority workload. We&apos;ll recommend the
              right infrastructure model.
            </p>
          </div>
          <Button variant="primary" href="/assessment" arrow>
            Book a Racko Meet
          </Button>
        </div>
      </section>

      <BottomCTA />
    </>
  );
}
