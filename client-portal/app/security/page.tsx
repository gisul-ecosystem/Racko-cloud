import BottomCTA from "@/components/sections/BottomCTA";
import SecuritySection from "@/components/sections/SecuritySection";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata = {
  title: "Security & Governance — Racko",
  description:
    "Policy-first infrastructure. Audit-ready by default. No bolted-on compliance.",
};

const pillars = [
  {
    title: "Controlled environments. Not shared ones.",
    desc: "Every production workload runs in a dedicated, segmented environment. Network isolation, storage boundaries, and access perimeters are defined at provisioning — not configured after the fact.",
    controls: [
      "Physical or logical environment segmentation",
      "Per-environment network isolation",
      "Storage encryption at rest (AES-256)",
      "Transit encryption (TLS 1.3 minimum)",
      "Workload-level access perimeter definition",
    ],
  },
  {
    title: "Role-based access. Full audit trail.",
    desc: "Every action taken on Racko-managed infrastructure is attributed to an identity, logged, and retrievable. Access is granted by role — not by default.",
    controls: [
      "Role-based access control (RBAC)",
      "Least-privilege provisioning model",
      "Multi-factor authentication enforcement",
      "Session logging and activity audit trail",
      "Access review cadence and reporting",
    ],
  },
  {
    title: "Visibility across every layer.",
    desc: "Cross-environment observability with structured log collection, metric aggregation, and anomaly detection. You see what's running, what changed, and what's at risk.",
    controls: [
      "Centralised log aggregation and retention",
      "Metric collection and threshold alerting",
      "Anomaly detection and drift monitoring",
      "Change event tracking across all environments",
      "Incident detection with defined escalation path",
    ],
  },
  {
    title: "Compliance posture you can demonstrate.",
    desc: "Racko's operational model is structured to support compliance evidence collection — not just internal controls. We help you demonstrate posture, not just maintain it.",
    controls: [
      "SOC 2 Type II readiness assessment",
      "HIPAA operational alignment support",
      "Evidence collection and audit support",
      "Compliance framework mapping",
      "Data sovereignty documentation",
    ],
  },
];

const responsibilityRows: [string, string][] = [
  ["Physical security & hardware", "Workload design & architecture"],
  ["Network infrastructure & isolation", "Application-level security"],
  ["Patch management & OS updates", "User identity & access policy"],
  ["24/7 monitoring & alerting", "Data classification & handling"],
  ["Incident detection & response", "Compliance obligations to regulators"],
  ["Backup & disaster recovery infra", "Business continuity decisions"],
  ["Audit log collection & retention", "Evidence submission to auditors"],
];

export default function SecurityPage() {
  return (
    <>
      <section className="bg-[#0A0A0A] pb-[100px] pt-[160px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="SECURITY & GOVERNANCE" />
          <h1 className="mt-4 font-sans text-[48px] font-extrabold leading-[1.02] tracking-[-0.03em] text-white md:text-[68px]">
            Policy-first.
            <br />
            Audit-ready by default.
          </h1>
          <p className="mt-7 max-w-[560px] text-[20px] font-normal leading-[1.7] text-[#6B6B6B]">
            Racko&apos;s security model is architectural — not a layer added
            after deployment. Governance, access control, and compliance readiness
            are built into how we operate every environment.
          </p>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-[120px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          {pillars.map((pillar, idx) => (
            <div
              key={pillar.title}
              className={`grid grid-cols-1 items-center gap-12 border-b border-[rgba(255,255,255,0.06)] py-16 md:grid-cols-2 md:gap-20 ${
                idx === 0 ? "border-t border-[rgba(255,255,255,0.06)]" : ""
              }`}
            >
              <div>
                <h3 className="font-sans text-[34px] font-extrabold leading-[1.12] tracking-[-0.03em] text-white">
                  {pillar.title}
                </h3>
                <p className="mt-5 text-base leading-[1.75] text-[#6B6B6B]">
                  {pillar.desc}
                </p>
              </div>
              <div className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-9">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">
                  CONTROLS IN PLACE
                </p>
                <div className="mt-5 space-y-2 font-mono text-xs leading-[2] text-[#3D3D3D]">
                  {pillar.controls.map((item) => (
                    <p key={item}>
                      <span className="mr-1.5 text-crimson-500">&gt;</span>
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#0A0A0A] py-[120px]">
        <SecuritySection fullDetail />
      </section>

      <section className="bg-[#0E0E0E] py-20">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="SHARED RESPONSIBILITY" />
          <h2 className="mt-4 font-sans text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white md:text-[52px]">
            What Racko owns. What you own.
          </h2>

          <div className="mt-10 overflow-hidden border border-[rgba(255,255,255,0.08)]">
            <div className="grid grid-cols-1 border-b border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] md:grid-cols-2">
              <div className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.1em] text-crimson-500">
                RACKO MANAGES
              </div>
              <div className="border-t border-[rgba(255,255,255,0.08)] px-5 py-4 font-mono text-[10px] uppercase tracking-[0.1em] text-[#3D3D3D] md:border-l md:border-t-0">
                YOU CONTROL
              </div>
            </div>
            {responsibilityRows.map((row, idx) => (
              <div
                key={row[0]}
                className={`grid grid-cols-1 border-b border-[rgba(255,255,255,0.06)] text-sm md:grid-cols-2 ${
                  idx % 2 === 0 ? "bg-[#1A1A1A]" : "bg-transparent"
                }`}
              >
                <div className="px-5 py-4 text-white">{row[0]}</div>
                <div className="border-t border-[rgba(255,255,255,0.06)] px-5 py-4 text-[#6B6B6B] md:border-l md:border-t-0">
                  {row[1]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <BottomCTA subline="with governance built in." />
    </>
  );
}
