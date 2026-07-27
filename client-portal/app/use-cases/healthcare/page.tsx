import type { Metadata } from "next";
import BottomCTA from "@/components/sections/BottomCTA";
import Button from "@/components/ui/Button";
import UseCaseBlock from "@/components/ui/UseCaseBlock";

export const metadata: Metadata = {
  title: "Healthcare Infrastructure Use Cases — Racko",
  description:
    "Infrastructure for LMS platforms, CloudLabs, assessment systems, GenAI learning environments, and hire-train-deploy factories.",
};

const useCases = [
  {
    number: "5.1",
    title: "Hospital Management System Infrastructure",
    archetypes: "EasySolution, MocDoc, Medixcel, Attune-style HMS platforms",
    columns: {
      industryReq: [
        "Hospital management systems require reliable infrastructure for appointments, billing, pharmacy, diagnostics, inpatient workflows, and administrative dashboards.",
        "Clinical operations depend on high availability and predictable response times across departments.",
      ],
      challengesSolved: [
        "System slowdowns during OPD and admission peaks",
        "Database contention across billing and clinical workloads",
        "Downtime risk in mission-critical patient workflows",
        "Weak disaster recovery preparedness for clinical records",
        "Operational overhead in infrastructure management",
      ],
      rackoStack: [
        "Private cloud architecture for HMS application tiers",
        "Bare metal DB for transactional consistency",
        "VPS tiers for integrations and support systems",
        "Backup / DR for patient and billing data continuity",
        "Managed monitoring and operations support",
      ],
      outcomes: [
        "25–40% improvement in HMS response consistency",
        "Reduced disruption risk during high patient volume windows",
        "Faster recovery readiness for critical patient systems",
        "Improved uptime posture for clinical operations",
        "Lower escalation volume tied to infra instability",
      ],
    },
  },
  {
    number: "5.2",
    title: "EHR/EMR and Patient Record Infrastructure",
    archetypes: "HealthPlix, Eka.care, KareXpert, Primera-type platforms",
    columns: {
      industryReq: [
        "EHR/EMR platforms require governed infrastructure for longitudinal patient records, clinician access, secure sharing, and compliant storage.",
        "Healthcare data workloads need resilient performance and strict sovereignty controls.",
      ],
      challengesSolved: [
        "Record retrieval delays in high-concurrency usage windows",
        "Access governance gaps across provider roles",
        "Storage growth pressure from longitudinal records",
        "Weak audit traceability for compliance checks",
        "Data recovery risk without tested DR posture",
      ],
      rackoStack: [
        "Private cloud for secure patient data environments",
        "Role-based access and policy guardrails",
        "Bare metal data services for high-read transactional access",
        "Backup / DR for record integrity and continuity",
        "Observability for access, latency, and reliability metrics",
      ],
      outcomes: [
        "30–45% faster record access consistency",
        "Stronger governance and audit readiness posture",
        "Lower risk of continuity failure for patient records",
        "Improved clinician workflow reliability",
        "Higher confidence in compliant data operations",
      ],
    },
  },
  {
    number: "5.3",
    title: "AI Diagnostics Infrastructure",
    archetypes:
      "Qure.ai, Niramai, SigTuple, Tricog-style diagnostic AI platforms",
    columns: {
      industryReq: [
        "Diagnostic AI platforms need GPU-ready infrastructure for model inference, image processing, and decision support delivery.",
        "Clinical AI workloads require controlled environments with reliability and traceability.",
      ],
      challengesSolved: [
        "Inference latency variability for diagnostic workflows",
        "GPU cost and capacity inefficiency",
        "Unstable serving under high-case volumes",
        "Weak traceability between model outputs and operational logs",
        "Complexity in scaling across sites and partners",
      ],
      rackoStack: [
        "GPU infrastructure for diagnostic model serving",
        "Private cloud controls for healthcare-grade data boundaries",
        "Storage and compute tiers for image-heavy pipelines",
        "Monitoring for inference latency and failure rates",
        "Managed operations for lifecycle and reliability",
      ],
      outcomes: [
        "25–40% improvement in diagnostic inference consistency",
        "Reduced GPU wastage through workload-aware placement",
        "Better reliability during high case-load windows",
        "Faster rollout readiness for new diagnostic models",
        "Stronger confidence in production clinical AI systems",
      ],
    },
  },
  {
    number: "5.4",
    title: "Telemedicine and Virtual Care Infrastructure",
    archetypes: "Practo, MediBuddy, mfine-style platforms",
    columns: {
      industryReq: [
        "Virtual care platforms require resilient infrastructure for video consultations, patient engagement, scheduling, and records integration.",
        "Session quality and availability are critical for patient trust and care continuity.",
      ],
      challengesSolved: [
        "Session quality degradation during demand spikes",
        "Platform instability across consultation traffic bursts",
        "Integration bottlenecks with backend clinical systems",
        "Data handling risk in distributed user environments",
        "Limited visibility into real-time service health",
      ],
      rackoStack: [
        "Hybrid-ready architecture for interactive care workloads",
        "VPS and private cloud tiers for consultation services",
        "Secure integration lanes for healthcare systems",
        "Observability for latency, session errors, and availability",
        "Managed operations for uptime and lifecycle management",
      ],
      outcomes: [
        "30–45% better consultation session stability",
        "Reduced service disruption during traffic surges",
        "Improved reliability for patient-facing workflows",
        "Faster issue detection and recovery in virtual care stacks",
        "Higher operational confidence for telemedicine growth",
      ],
    },
  },
  {
    number: "5.5",
    title: "Healthcare Analytics and Remote Monitoring Infrastructure",
    archetypes:
      "eKincare, BeatO, chronic care, wellness, RPM platforms",
    columns: {
      industryReq: [
        "Remote patient monitoring and analytics programs require scalable ingestion, secure storage, and timely processing of health telemetry.",
        "Teams need reliable infrastructure for reporting, alerting, and longitudinal trend analysis.",
      ],
      challengesSolved: [
        "Ingestion lag from high-volume remote monitoring signals",
        "Analytics delays affecting care workflows",
        "Fragmented data processing environments",
        "Governance challenges in long-term health data retention",
        "Operational overhead in maintaining always-on infrastructure",
      ],
      rackoStack: [
        "Workload-aware compute for telemetry and analytics pipelines",
        "Private cloud controls for health data governance",
        "Storage architecture for short-term and long-term datasets",
        "Monitoring for ingestion lag, processing latency, and failures",
        "Managed operations for continuity and compliance readiness",
      ],
      outcomes: [
        "25–40% faster processing of remote monitoring data",
        "Improved reliability for care analytics and alerts",
        "Stronger governance posture for health telemetry pipelines",
        "Lower operational toil across analytics infrastructure layers",
        "Higher confidence in RPM program scalability",
      ],
    },
  },
];

export default function HealthcareUseCasesPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            HEALTHCARE
          </p>
          <h1 className="mt-5 font-sans text-[40px] font-extrabold leading-[1.04] tracking-[-0.03em] text-white md:text-[56px] lg:text-[64px]">
            Infrastructure for healthcare and MedTech platforms.
          </h1>
          <p className="mt-6 max-w-[560px] font-sans text-[18px] leading-[1.7] text-[#6B6B6B]">
            HMS, EHR/EMR, AI diagnostics, telemedicine, and remote health
            monitoring — built for data sovereignty, clinical availability, and
            HIPAA-aligned operations.
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
              Building healthcare software or managing clinical infrastructure?
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
