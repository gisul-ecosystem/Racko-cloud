import BottomCTA from "@/components/sections/BottomCTA";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata = {
  title: "Industries — Racko",
  description:
    "Infrastructure built for EdTech, Healthcare, AI-native startups, BPO/KPO, and Manufacturing.",
};

type IndustryDetail = {
  label: string;
  title: string;
  desc: string;
  requirements: string[];
  approach: string;
};

const industries: IndustryDetail[] = [
  {
    label: "EDTECH",
    title: "Learning platforms at enterprise scale.",
    desc: "EdTech platforms face a unique infrastructure challenge — massive concurrent load during exam periods, strict data residency requirements, and zero tolerance for downtime during live sessions.",
    requirements: [
      "10,000+ concurrent student sessions",
      "Data residency and FERPA alignment",
      "Sub-100ms video and content delivery",
      "Burst capacity during assessments",
      "Multi-tenant isolation per institution",
    ],
    approach:
      "Private compute for core platform workloads + cloud burst capacity for peak events. All governed under a single operations model with full audit trail.",
  },
  {
    label: "HEALTHCARE & MEDTECH",
    title: "HIPAA-oriented environments for clinical workloads.",
    desc: "Healthcare infrastructure must balance performance, data sovereignty, and regulatory compliance without compromise. Patient data doesn't belong in multi-tenant cloud environments.",
    requirements: [
      "HIPAA-oriented access controls",
      "Patient data sovereignty enforcement",
      "PHI encryption at rest and in transit",
      "Audit trail for all data access events",
      "Business continuity and DR planning",
    ],
    approach:
      "Dedicated private environments with policy-enforced data placement and full audit log collection — aligned to HIPAA operational requirements.",
  },
  {
    label: "AI-NATIVE STARTUPS",
    title: "GPU compute with the governance to reach production.",
    desc: "AI-native teams need GPU access, fast — but also need the cost economics, model governance, and inference management that public cloud GPU instances don't provide.",
    requirements: [
      "H100 / A100 GPU cluster access",
      "Cost-per-inference attribution",
      "Model version and access governance",
      "Inference environment isolation",
      "MLOps pipeline integration",
    ],
    approach:
      "Purpose-built AI compute environments with inference management, cost attribution, and the operational oversight to move models from pilot to production.",
  },
  {
    label: "BPO & KNOWLEDGE SERVICES",
    title: "High-availability infrastructure for operations at scale.",
    desc: "BPO and KPO operations run 24/7 with thousands of concurrent users, strict SLAs, and data handling requirements across multiple client environments.",
    requirements: [
      "99.99% availability SLA targets",
      "Multi-client environment isolation",
      "Data handling per client compliance needs",
      "Global or multi-region deployment",
      "Rapid environment provisioning for new clients",
    ],
    approach:
      "Managed private infrastructure with environment segmentation per client, unified ops oversight, and defined SLAs with incident response.",
  },
  {
    label: "MANUFACTURING & INDUSTRIAL",
    title: "Edge-connected infrastructure for operational technology.",
    desc: "Manufacturing environments connect operational technology with enterprise IT — requiring low-latency local compute, secure OT/IT integration, and industrial-grade reliability.",
    requirements: [
      "Edge compute at factory / plant level",
      "OT/IT network segmentation",
      "Real-time data processing pipelines",
      "Industrial protocol integration",
      "On-site hardware reliability standards",
    ],
    approach:
      "Private infrastructure deployed on-site or at co-location facilities close to operations — with managed OT/IT integration and 24/7 monitoring.",
  },
];

export default function IndustriesPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-[100px] pt-[160px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="INDUSTRIES" />
          <h1 className="mt-4 font-sans text-[48px] font-extrabold leading-[1.02] tracking-[-0.03em] text-white md:text-[72px]">
            Built for the teams running
            <br />
            critical infrastructure.
          </h1>
          <p className="mt-7 max-w-[580px] text-[20px] font-normal leading-[1.7] text-[#6B6B6B]">
            Different industries carry different infrastructure requirements.
            Racko maps to your compliance posture, workload profile, and
            operational constraints.
          </p>
        </div>
      </section>

      {industries.map((industry, idx) => {
        const isOdd = idx % 2 === 0;
        return (
          <section
            key={industry.title}
            className={`${isOdd ? "bg-[#0E0E0E]" : "bg-[#0A0A0A]"} border-t border-[rgba(255,255,255,0.06)] py-[100px]`}
          >
            <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-14 px-6 md:grid-cols-2 md:gap-20 xl:px-8">
              <div className={isOdd ? "" : "md:order-2"}>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">
                  {industry.label}
                </p>
                <h2 className="mt-3 font-sans text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white md:text-[44px]">
                  {industry.title}
                </h2>
                <p className="mt-5 max-w-[620px] text-base leading-[1.7] text-[#6B6B6B]">
                  {industry.desc}
                </p>
              </div>

              <div
                className={`${isOdd ? "" : "md:order-1"} rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-9`}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">
                  KEY REQUIREMENTS
                </p>
                <div className="mt-5 space-y-2 font-mono text-xs leading-[2] text-[#3D3D3D]">
                  {industry.requirements.map((item) => (
                    <p key={item}>
                      <span className="mr-1.5 text-crimson-500">&gt;</span>
                      {item}
                    </p>
                  ))}
                </div>
                <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">
                  RACKO APPROACH
                </p>
                <p className="mt-3 text-[13px] leading-[1.7] text-[#6B6B6B]">
                  {industry.approach}
                </p>
              </div>
            </div>
          </section>
        );
      })}

      <BottomCTA />
    </>
  );
}
