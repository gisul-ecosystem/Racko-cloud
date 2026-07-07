import type { Metadata } from "next";
import BottomCTA from "@/components/sections/BottomCTA";
import Button from "@/components/ui/Button";
import UseCaseBlock from "@/components/ui/UseCaseBlock";

export const metadata: Metadata = {
  title: "EdTech Infrastructure Use Cases — Racko",
  description:
    "Infrastructure for LMS platforms, CloudLabs, assessment systems, GenAI learning environments, and hire-train-deploy factories.",
};

const useCases = [
  {
    number: "1.1",
    title: "Scalable LMS Infrastructure for High-Concurrency Learner Access",
    archetypes: "Paradiso LMS, Hurix Digital, Tesseract Learning, XEDU Learning",
    columns: {
      industryReq: [
        "LMS platforms must support learners, live cohorts, content streaming, assessments, certificates, analytics, and enterprise dashboards",
        "Traffic spikes during batch launches, certification deadlines, campus drives, and corporate learning campaigns",
      ],
      challengesSolved: [
        "LMS slowdown during concurrent learner logins",
        "Database bottlenecks during assessments and quiz submissions",
        "Rising public cloud cost for stable workloads",
        "Weak tenant isolation for enterprise customers",
      ],
      rackoStack: [
        "Private cloud for LMS workloads",
        "Bare metal database layer for predictable performance",
        "VPS for admin portals, staging, and reporting",
        "Backup/DR for learner records, certificates, and assessment data",
        "Managed monitoring for app, DB, storage, and uptime",
      ],
      outcomes: [
        "30–45% improvement in LMS response time during peak learner access",
        "25–35% reduction in infrastructure cost for stable workloads",
        "40–50% faster recovery of learner/certificate data",
        "20–30% reduction in platform escalations caused by infra instability",
        "99.5%+ target uptime readiness for enterprise learning delivery",
      ],
    },
  },
  {
    number: "1.2",
    title: "Managed CloudLabs Infrastructure for Technical Training",
    archetypes: "SpringPeople, edForce, Stalwart Learning, XLPro Training Solutions",
    columns: {
      industryReq: [
        "Technical training providers need hands-on labs for cloud, DevOps, Kubernetes, cybersecurity, data engineering, AI/ML, and full-stack development",
        "Cohort delivery depends on stable, repeatable, pre-provisioned environments",
      ],
      challengesSolved: [
        "Slow lab provisioning before cohorts",
        "High public cloud consumption during training",
        "Inconsistent learner environments",
        "Trainers spending time on setup instead of delivery",
        "Poor lab health visibility",
      ],
      rackoStack: [
        "VPS-based learner lab environments",
        "Bare metal for Kubernetes, databases, DevOps, and heavy labs",
        "Snapshot-based lab reset",
        "Private cloud for enterprise-specific cohorts",
        "Managed Day 0, Day 1, and Day 2 lab operations",
      ],
      outcomes: [
        "50–70% faster lab environment provisioning",
        "25–40% reduction in cloud/lab wastage through reusable templates",
        "30–45% reduction in trainer-led troubleshooting",
        "20–35% improvement in learner lab completion rates",
        "2x faster cohort readiness for repeat training programs",
      ],
    },
  },
  {
    number: "1.3",
    title: "Assessment and Certification Platform Resilience",
    archetypes: "MeritTrac-style platforms, edForce assessments, certification providers",
    columns: {
      industryReq: [
        "Assessment platforms need stable infra for online exams, coding tests, proctoring, certification records, audit logs, and reporting",
        "Exam windows require predictable availability and fast submission processing",
      ],
      challengesSolved: [
        "Submission failures during exam peaks",
        "Database locks during concurrent test attempts",
        "Storage pressure from proctoring recordings and screenshots",
        "Slow audit retrieval",
        "Weak DR planning for exam windows",
      ],
      rackoStack: [
        "Private cloud for assessment engines",
        "Bare metal DB for high-concurrency submissions",
        "VPS pools for candidate sessions",
        "Storage and backup for proctoring data",
        "Observability for latency, failed submissions, and infra health",
      ],
      outcomes: [
        "40–60% reduction in exam-window infra incidents",
        "30–50% faster candidate submission processing",
        "50–70% faster retrieval of logs, reports, and audit records",
        "25–35% lower risk of peak-load failures through workload segregation",
        "99.5%+ assessment availability target during planned exam windows",
      ],
    },
  },
  {
    number: "1.4",
    title: "GPU-Ready GenAI Learning Sandbox",
    archetypes: "UNext, Stalwart Learning, GenAI academies",
    columns: {
      industryReq: [
        "GenAI training requires applied environments for prompt engineering, RAG, vector databases, AI agents, model inference, and secure enterprise datasets",
        "Programs must simulate production AI workflows, not just theory",
      ],
      challengesSolved: [
        "Expensive GPU/API consumption",
        "No learner-level isolation",
        "API key misuse",
        "Inconsistent notebook and vector DB setup",
        "Limited governance for enterprise datasets",
      ],
      rackoStack: [
        "GPU-ready infrastructure",
        "Private cloud for secure cohorts",
        "Dedicated compute for vector DBs, notebooks, and APIs",
        "Hybrid integration with public AI services",
        "GPU utilization and lab monitoring",
      ],
      outcomes: [
        "35–50% reduction in uncontrolled API/GPU usage",
        "40–60% faster GenAI lab launch",
        "30–45% improvement in hands-on project completion",
        "25–40% better GPU utilization through right-sized workload placement",
        "50%+ reduction in environment setup issues across cohorts",
      ],
    },
  },
  {
    number: "1.5",
    title: "Hire-Train-Deploy Infrastructure Factory",
    archetypes: "TeamLease EdTech, edForce, UNext-style workforce academies",
    columns: {
      industryReq: [
        "Hire-train-deploy programs need repeatable infra for screening, onboarding, lab practice, capstone projects, assessments, and employer evaluation",
        "Batch-based delivery requires fast provisioning and standard evaluation environments",
      ],
      challengesSolved: [
        "Multiple batches running different tech stacks",
        "High-volume short-lived lab environments",
        "No standardized candidate evaluation infra",
        "Operational overhead in batch setup and teardown",
      ],
      rackoStack: [
        "Cohort-wise VPS pools",
        "Role-based lab templates",
        "Private employer-specific environments",
        "Snapshot-based project environments",
        "Managed provisioning and teardown",
      ],
      outcomes: [
        "45–60% faster batch onboarding",
        "30–40% lower per-cohort infra operations effort",
        "25–35% improvement in candidate evaluation consistency",
        "20–30% faster employer deployment readiness",
        "2x reuse potential of lab templates across recurring programs",
      ],
    },
  },
];

export default function EdtechUseCasesPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            EDTECH
          </p>
          <h1 className="mt-5 font-sans text-[40px] font-extrabold leading-[1.04] tracking-[-0.03em] text-white md:text-[56px] lg:text-[64px]">
            Infrastructure for EdTech platforms.
          </h1>
          <p className="mt-6 max-w-[560px] font-sans text-[18px] leading-[1.7] text-[#6B6B6B]">
            From LMS stability to GPU-ready GenAI learning environments — Racko
            maps infrastructure to the specific demands of technical training,
            assessment, and workforce programs.
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
              Running an EdTech platform or training business?
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
