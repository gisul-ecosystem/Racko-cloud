import type { Metadata } from "next";
import BottomCTA from "@/components/sections/BottomCTA";
import Button from "@/components/ui/Button";
import UseCaseBlock from "@/components/ui/UseCaseBlock";

export const metadata: Metadata = {
  title: "Manufacturing Infrastructure Use Cases — Racko",
  description:
    "Infrastructure for LMS platforms, CloudLabs, assessment systems, GenAI learning environments, and hire-train-deploy factories.",
};

const useCases = [
  {
    number: "4.1",
    title: "Industrial IoT and Machine Monitoring Infrastructure",
    archetypes: "Datoms, Haber, Factana-style IIoT platforms",
    columns: {
      industryReq: [
        "Industrial monitoring platforms need low-latency ingestion infrastructure for machine telemetry, event streams, and alerting workflows.",
        "Factory operations demand reliable uptime and edge-aware data processing across distributed plants.",
      ],
      challengesSolved: [
        "Telemetry ingestion bottlenecks during peak machine output",
        "Latency spikes impacting real-time visibility",
        "Weak reliability in distributed plant environments",
        "Fragmented infrastructure across OT/IT stacks",
        "Operational burden in maintaining site-specific setups",
      ],
      rackoStack: [
        "Edge-aligned compute with private cloud integration",
        "VPS and bare metal mix for stream processing workloads",
        "Secure network design across plant and core systems",
        "Monitoring for ingestion lag, service health, and alert latency",
        "Managed operations for lifecycle, patching, and support",
      ],
      outcomes: [
        "30–45% better telemetry processing consistency",
        "Lower latency variability for real-time plant visibility",
        "Improved uptime for machine monitoring workflows",
        "Reduced integration friction across distributed sites",
        "Higher operational confidence for production-critical systems",
      ],
    },
  },
  {
    number: "4.2",
    title: "Predictive Maintenance Infrastructure",
    archetypes:
      "Presage Insights, Haber, Maximl-style industrial AI platforms",
    columns: {
      industryReq: [
        "Predictive maintenance workloads require stable pipelines for sensor ingestion, model scoring, and maintenance recommendation loops.",
        "Operations teams need near-real-time analytics and resilient infra during production cycles.",
      ],
      challengesSolved: [
        "Slow model scoring and delayed maintenance alerts",
        "Data pipeline failures across sensor networks",
        "Inconsistent compute performance for analytics jobs",
        "Difficulty scaling inference to multi-plant operations",
        "Limited observability into pipeline reliability",
      ],
      rackoStack: [
        "Dedicated compute for scoring and predictive models",
        "Hybrid deployment for plant-edge and central analytics",
        "Storage architecture for time-series and history retention",
        "Monitoring for model latency and prediction pipeline health",
        "Managed operations with backup and DR planning",
      ],
      outcomes: [
        "20–35% faster maintenance alert generation cycles",
        "Improved consistency in predictive scoring workloads",
        "Reduced unplanned downtime risk from infra bottlenecks",
        "Faster rollout of predictive programs across plants",
        "Higher reliability for maintenance intelligence systems",
      ],
    },
  },
  {
    number: "4.3",
    title: "Manufacturing ERP Infrastructure Modernization",
    archetypes:
      "SourcePro, VasyERP, Tech4LYF-style manufacturing ERP platforms",
    columns: {
      industryReq: [
        "Manufacturing ERP platforms need stable core infrastructure for planning, procurement, inventory, finance, and production operations.",
        "Modernization efforts require phased migration without disrupting plant execution workflows.",
      ],
      challengesSolved: [
        "Legacy infra instability impacting ERP responsiveness",
        "Downtime risk during modernization and migration",
        "Database constraints during high transaction windows",
        "Weak DR posture for business-critical operations",
        "Cost pressure from inefficient workload placement",
      ],
      rackoStack: [
        "Private cloud for ERP application tiers",
        "Bare metal database infrastructure for consistency",
        "VPS environments for integration and staging lanes",
        "Backup / DR for transactional and reporting datasets",
        "Managed migration and post-cutover operations support",
      ],
      outcomes: [
        "25–40% improvement in ERP response consistency",
        "Reduced modernization risk through phased cutover planning",
        "Higher transactional reliability during production periods",
        "Faster recovery readiness for ERP-critical data layers",
        "More predictable infrastructure economics for core operations",
      ],
    },
  },
  {
    number: "4.4",
    title: "Factory Edge + Private Cloud Architecture",
    archetypes:
      "Auto component, electronics, pharma, industrial equipment manufacturers",
    columns: {
      industryReq: [
        "Factories need edge processing for low-latency operations while maintaining central governance and analytics in private cloud.",
        "Architecture must support regional data handling and resilient inter-site connectivity.",
      ],
      challengesSolved: [
        "Latency and reliability issues with cloud-only patterns",
        "Weak data governance across plants and central systems",
        "Operational complexity in multi-site infrastructure control",
        "Inconsistent security posture at edge locations",
        "Difficulty managing updates across edge workloads",
      ],
      rackoStack: [
        "Edge compute nodes integrated with private cloud control plane",
        "Secure segmentation across plant and central environments",
        "Workload-aware placement for local and central processing",
        "Observability and governance across every site",
        "Managed operations for edge lifecycle and continuity",
      ],
      outcomes: [
        "Lower latency for plant-critical operations",
        "Stronger governance across distributed manufacturing infrastructure",
        "Improved resilience for edge-dependent workloads",
        "Reduced operational overhead in multi-site management",
        "Clearer workload placement between edge and central systems",
      ],
    },
  },
  {
    number: "4.5",
    title: "AI Quality Inspection and Visual Analytics Infrastructure",
    archetypes:
      "Smart factory AI startups, computer vision inspection platforms",
    columns: {
      industryReq: [
        "AI inspection workloads require GPU-ready inference environments, image pipeline throughput, and low-latency decision feedback at line level.",
        "Production quality systems need robust uptime and controlled model deployment cycles.",
      ],
      challengesSolved: [
        "Inference bottlenecks in high-volume inspection workflows",
        "Storage pressure from image/video inspection data",
        "Unstable model serving during production shifts",
        "Slow deployment cycles for updated vision models",
        "Limited traceability from defect to model decision path",
      ],
      rackoStack: [
        "GPU infrastructure for visual inference pipelines",
        "High-throughput storage for image and video workloads",
        "Private deployment lanes for production inspection systems",
        "Monitoring for latency, defect throughput, and model health",
        "Managed operations for updates, rollback, and uptime control",
      ],
      outcomes: [
        "30–45% improvement in inference stability at production scale",
        "Faster model rollout cycles for inspection updates",
        "Lower quality incident risk due to infra inconsistency",
        "Improved visibility into AI inspection performance metrics",
        "Higher operational confidence for factory AI deployment",
      ],
    },
  },
];

export default function ManufacturingUseCasesPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            MANUFACTURING
          </p>
          <h1 className="mt-5 font-sans text-[40px] font-extrabold leading-[1.04] tracking-[-0.03em] text-white md:text-[56px] lg:text-[64px]">
            Infrastructure for manufacturing and industrial operations.
          </h1>
          <p className="mt-6 max-w-[560px] font-sans text-[18px] leading-[1.7] text-[#6B6B6B]">
            IIoT, predictive maintenance, ERP modernisation, factory edge
            compute, and AI quality inspection — infrastructure that runs at the
            plant level.
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
              Running a manufacturing plant or industrial AI platform?
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
