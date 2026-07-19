import type { Metadata } from "next";
import BottomCTA from "@/components/sections/BottomCTA";
import Button from "@/components/ui/Button";
import UseCaseBlock from "@/components/ui/UseCaseBlock";

export const metadata: Metadata = {
  title: "AI Startup Infrastructure Use Cases — Racko",
  description:
    "Workload-aware infrastructure for EdTech, AI Startups, BPO/KPO, Manufacturing, and Healthcare.",
};

const useCases = [
  {
    number: "2.1",
    title: "GPU Infrastructure for Model Training and Fine-Tuning",
    archetypes:
      "Sarvam AI, Krutrim-style LLM startups, GenAI product companies",
    columns: {
      industryReq: [
        "AI-native teams need high-memory GPU clusters for model training, fine-tuning, checkpointing, and experiment tracking.",
        "Training cycles require predictable throughput, fast storage access, and controlled budget usage per project.",
      ],
      challengesSolved: [
        "GPU capacity shortages during peak training windows",
        "Uncontrolled cloud GPU spend and idle wastage",
        "Slow dataset movement between compute and storage",
        "Inconsistent training environments across teams",
        "Limited visibility into utilization and run costs",
      ],
      rackoStack: [
        "Dedicated GPU infrastructure with right-sized node pools",
        "High-throughput storage for model and dataset pipelines",
        "Private cloud segmentation for team-level isolation",
        "Cluster monitoring for utilization, queue, and failure patterns",
        "Managed operations for provisioning, patching, and scaling",
      ],
      outcomes: [
        "30–45% improvement in training job throughput consistency",
        "25–40% reduction in GPU cost leakage from idle capacity",
        "35–50% faster environment readiness for new model programs",
        "20–30% better utilization through workload-aware placement",
        "Predictable training run economics across product teams",
      ],
    },
  },
  {
    number: "2.2",
    title: "Production Inference Infrastructure for AI SaaS",
    archetypes: "Observe.AI, Avaamo, Yellow.ai-style platforms",
    columns: {
      industryReq: [
        "Inference platforms require low-latency serving infrastructure, autoscaling controls, and region-aware traffic handling.",
        "SLA-driven AI SaaS products need resilient serving, version control, and rollback-safe deployments.",
      ],
      challengesSolved: [
        "Latency spikes during inference burst periods",
        "Unpredictable serving costs at scale",
        "Model deployment failures in production windows",
        "Weak observability across API and inference layers",
        "Inconsistent performance across regions",
      ],
      rackoStack: [
        "GPU and CPU inference pools based on model profiles",
        "Private ingress and traffic routing for tenant isolation",
        "Hybrid architecture for burst and overflow patterns",
        "Observability for inference latency, error rates, and saturation",
        "Managed deployment workflows with rollback safeguards",
      ],
      outcomes: [
        "25–40% reduction in p95 inference latency variability",
        "20–35% reduction in serving cost volatility",
        "40–60% faster rollout of model updates",
        "Improved SLA adherence across enterprise workloads",
        "Lower production risk via controlled model release pipelines",
      ],
    },
  },
  {
    number: "2.3",
    title: "Vector Database and RAG Infrastructure",
    archetypes:
      "Enterprise AI assistant builders, legal AI, HR AI, knowledge AI startups",
    columns: {
      industryReq: [
        "RAG applications require reliable vector indexing, embedding pipelines, retrieval latency control, and governed data access.",
        "Knowledge AI workloads need secure storage and region-compliant data placement for enterprise datasets.",
      ],
      challengesSolved: [
        "Retrieval latency inconsistency under query concurrency",
        "Index growth pressure on storage and compute",
        "Weak access controls on enterprise knowledge stores",
        "Embedding pipeline bottlenecks and retry failures",
        "Limited traceability from prompt to retrieved context",
      ],
      rackoStack: [
        "Dedicated compute for vector DB and retrieval services",
        "Private cloud lanes for secure corpus hosting",
        "Pipeline orchestration for ingestion and embedding refresh",
        "Observability across retrieval, cache, and generation path",
        "Backup and DR for vector stores and metadata layers",
      ],
      outcomes: [
        "30–45% improvement in retrieval response consistency",
        "20–35% better query success under peak concurrency",
        "Faster corpus refresh cycles for production assistants",
        "Stronger governance for enterprise data boundaries",
        "Lower operational toil for RAG infrastructure management",
      ],
    },
  },
  {
    number: "2.4",
    title: "AI Data Engineering and Pipeline Infrastructure",
    archetypes: "Locus, Shipsy, CropIn, AI analytics platforms",
    columns: {
      industryReq: [
        "AI products depend on robust data pipelines for ingestion, transformation, feature preparation, and model serving feedback loops.",
        "Pipelines must support scale while preserving data quality and governance across source systems.",
      ],
      challengesSolved: [
        "Pipeline failures during high-volume ingestion windows",
        "Slow batch processing impacting model freshness",
        "Fragmented infrastructure across ETL and ML workloads",
        "Limited governance on data movement and retention",
        "Operational overhead in maintaining mixed environments",
      ],
      rackoStack: [
        "Bare metal and VPS mix for pipeline compute tiers",
        "Storage architecture for hot, warm, and archival data",
        "Private cloud isolation for sensitive enterprise flows",
        "Monitoring for throughput, lag, and job failure patterns",
        "Managed operations for lifecycle and reliability controls",
      ],
      outcomes: [
        "35–50% faster data pipeline processing windows",
        "20–30% reduction in stale-feature and delayed-training risk",
        "Improved reliability across ingestion-to-serving pipeline stages",
        "Lower infrastructure fragmentation and support load",
        "Clear governance posture for regulated enterprise data flows",
      ],
    },
  },
  {
    number: "2.5",
    title: "Secure Private AI Deployment for Enterprise Clients",
    archetypes:
      "StratiformAI-type AI consultancies, enterprise GenAI studios",
    columns: {
      industryReq: [
        "Enterprise AI programs require private deployment models for sensitive prompts, context data, and generated outputs.",
        "Delivery teams need repeatable private AI environments across client accounts with strong access and audit controls.",
      ],
      challengesSolved: [
        "Client concerns around data leakage and model exposure",
        "Lack of standardized private deployment blueprints",
        "Weak audit trails for regulated client engagements",
        "Inconsistent security controls across delivery teams",
        "High overhead to replicate enterprise-grade environments",
      ],
      rackoStack: [
        "Private cloud tenancy for client-isolated deployments",
        "Role-based access controls and policy guardrails",
        "Dedicated inference and data processing environments",
        "Audit-ready logging and observability layers",
        "Managed operations for uptime, patching, and compliance support",
      ],
      outcomes: [
        "Faster enterprise onboarding for private AI deployments",
        "Stronger client trust through controlled data boundaries",
        "Reduced delivery overhead with reusable deployment templates",
        "Improved compliance readiness for regulated sectors",
        "Higher production confidence for enterprise AI rollout programs",
      ],
    },
  },
];

export default function AiStartupsUseCasesPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            AI STARTUPS
          </p>
          <h1 className="mt-5 font-sans text-[40px] font-extrabold leading-[1.04] tracking-[-0.03em] text-white md:text-[56px] lg:text-[64px]">
            Infrastructure for AI-native startups.
          </h1>
          <p className="mt-6 max-w-[560px] font-sans text-[18px] leading-[1.7] text-[#6B6B6B]">
            GPU training, production inference, RAG stacks, data pipelines, and
            secure enterprise AI deployment — from pilot to production scale.
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
              Building an AI product or deploying GenAI for enterprise clients?
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
