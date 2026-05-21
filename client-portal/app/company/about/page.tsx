import Link from "next/link";
import BookDemoTriggerButton from "@/components/ui/BookDemoTriggerButton";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata = {
  title: "About Racko — Enterprise Cloud Partner",
  description:
    "Racko Cloud is an enterprise-grade cloud product and managed operations partner for organizations that need more than generic hosting.",
};

const beliefs = [
  {
    label: "BELIEF 01",
    title: "Workload first",
    desc: "Cloud decisions should start with what the workload needs — not with a vendor's pricing model.",
  },
  {
    label: "BELIEF 02",
    title: "Governance by design",
    desc: "Security, backup, and compliance are not features you add — they are properties of how cloud is architected and operated.",
  },
  {
    label: "BELIEF 03",
    title: "Operations as a product",
    desc: "Managed cloud operations should feel like a product — not a professional services engagement.",
  },
];

const partnerBadges = [
  { name: "AWS", status: "Authorized Partner" },
  { name: "Azure", status: "Authorized Partner" },
  { name: "GCP", status: "Partner" },
  { name: "Oracle Cloud", status: "Partner" },
];

const ecosystem = [
  {
    label: "RACKO",
    title: "Cloud Platform",
    desc: "VPS, Dedicated Cloud, GPU, CloudLabs, Storage, Managed Ops.",
    active: true,
  },
  {
    label: "KANONKODE",
    title: "EdTech Platform",
    desc: "Developer and data skills training for individual learners.",
  },
  {
    label: "GISUL ENTERPRISE",
    title: "Corporate Training",
    desc: "Enterprise AI upskilling and training programs at scale.",
  },
  {
    label: "AAPTOR",
    title: "AI Assessment",
    desc: "AI-powered interviewing, proctoring, and competency assessment.",
  },
];

export default function CompanyAboutPage() {
  return (
    <main className="min-w-0">
      {/* Hero */}
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="ABOUT RACKO" />
          <h1 className="mt-5 max-w-[900px] font-sans text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white sm:text-[52px] md:text-[64px] md:leading-[1.08]">
            We believe cloud infrastructure
            <br />
            should serve the workload.
          </h1>
          <p className="mt-6 max-w-[600px] font-sans text-[18px] font-normal leading-[1.65] text-[#6B6B6B]">
            Racko Cloud is an enterprise-grade cloud product and managed operations partner — built for organizations that
            need more than generic hosting.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto max-w-[900px] px-4 text-center sm:px-6">
          <div className="font-sans text-[80px] font-normal leading-[0.5] text-crimson-500">&quot;</div>
          <p className="mt-2 font-sans text-[22px] font-semibold leading-[1.4] text-white sm:text-[26px] md:text-[28px]">
            For too long, organizations were forced to choose between the control of on-prem and the simplicity of
            public cloud. Racko Cloud gives you both — productized cloud, local control, and one accountable partner.
          </p>
          <div className="mt-12 border-t border-[rgba(255,255,255,0.08)] pt-8">
            <div className="flex flex-col gap-10 lg:flex-row lg:justify-center lg:gap-12">
              {beliefs.map((item) => (
                <div key={item.label} className="flex-1 text-center lg:max-w-[260px]">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-crimson-500">
                    {item.label}
                  </p>
                  <p className="mt-2 font-sans text-base font-semibold text-white">{item.title}</p>
                  <p className="mt-2 font-sans text-[13px] font-normal leading-[1.7] text-[#6B6B6B]">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What Racko Delivers */}
      <section className="bg-[#0A0A0A] py-24">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-16 xl:px-8">
          <div className="min-w-0">
            <Eyebrow label="WHAT WE DELIVER" />
            <h2 className="mt-4 font-sans text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white md:text-[44px]">
              Gisul Software Services — the team behind Racko.
            </h2>
            <p className="mt-6 font-sans text-base font-normal leading-[1.7] text-[#6B6B6B]">
              Racko is built by Gisul Software Services Pvt. Ltd., an enterprise AI enablement and infrastructure
              services company headquartered in Bengaluru, India. Founded to bridge the gap between expensive public
              cloud and underserved enterprise infrastructure needs.
            </p>
            <p className="mt-5 font-sans text-base font-normal leading-[1.7] text-[#6B6B6B]">
              Racko Cloud is our cloud product platform — delivering VPS, Cloud VPS, Dedicated Server, HA Dedicated
              Cloud, Private Cloud, GPU Cloud, CloudLabs, S3-compatible storage, backup storage, web hosting, and managed
              cloud operations — backed by Webyne data centre infrastructure across Mumbai, Noida, and Chennai.
            </p>
          </div>

          <div className="min-w-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {partnerBadges.map((badge) => (
                <div
                  key={badge.name}
                  className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-6 text-center"
                >
                  <p className="font-sans text-lg font-bold text-white">{badge.name}</p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#3D3D3D]">{badge.status}</p>
                </div>
              ))}
              <div className="col-span-full rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-6 text-center sm:col-span-2">
                <p className="font-sans text-sm font-semibold text-white">Webyne Data Centre</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#3D3D3D]">
                  Infrastructure Partner
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gisul Ecosystem */}
      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="ECOSYSTEM" />
          <h2 className="mt-4 font-sans text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white md:text-[44px]">
            Part of the Gisul ecosystem.
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-px bg-[#B91C1C] lg:grid-cols-4">
            {ecosystem.map((item) => (
              <article
                key={item.label}
                className={`bg-[#1A1A1A] px-7 py-8 ${
                  item.active ? "ring-1 ring-inset ring-[#B91C1C]" : ""
                }`}
              >
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-crimson-500">
                  {item.label}
                </p>
                <h3 className="mt-3 font-sans text-base font-bold text-white">{item.title}</h3>
                <p className="mt-3 font-sans text-sm font-normal leading-[1.7] text-[#6B6B6B]">{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Location & Contact */}
      <section className="bg-[#0A0A0A] py-24">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 xl:px-8">
          <div>
            <Eyebrow label="LOCATION" />
            <h3 className="mt-4 font-sans text-2xl font-bold text-white">Bengaluru, India</h3>
            <p className="mt-4 font-sans text-sm font-normal leading-[1.7] text-[#6B6B6B]">
              HSR Layout, Bengaluru — Karnataka, India. Serving enterprise clients across India and Southeast Asia.
            </p>
            <p className="mt-6 font-mono text-[11px] text-[#3D3D3D]">cloud@racko.in</p>
          </div>

          <div>
            <Eyebrow label="GET IN TOUCH" />
            <h3 className="mt-4 font-sans text-2xl font-bold text-white">Let&apos;s start a conversation.</h3>
            <p className="mt-4 font-sans text-sm font-normal leading-[1.7] text-[#6B6B6B]">
              Whether you have a specific workload challenge, an RFP to discuss, or want to understand if Racko Cloud is
              the right fit — we respond within one business day.
            </p>
            <div className="mt-7 flex max-w-[280px] flex-col gap-2.5">
              <BookDemoTriggerButton variant="primary" size="md" className="w-full justify-center">
                Book a Racko Meet →
              </BookDemoTriggerButton>
              <Link
                href="/company/contact"
                className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] border border-[rgba(255,255,255,0.15)] bg-transparent px-7 py-[11px] font-sans text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)]"
              >
                Contact us →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
