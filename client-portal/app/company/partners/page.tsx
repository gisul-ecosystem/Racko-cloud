import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata = {
  title: "Ecosystem Partners - Racko Cloud",
  description:
    "Racko Cloud is backed by authorized partnerships with AWS, Azure, GCP, Oracle Cloud, and Webyne data centre infrastructure.",
};

const infrastructureSpecs = [
  "Tier III Infrastructure",
  "99.95% Uptime SLA",
  "24/7 NOC Support",
  "Physical Security",
  "Redundant Power",
  "High-Bandwidth Connectivity",
] as const;

const cloudPartners = [
  {
    name: "AWS",
    badge: "Authorized Partner",
    desc: "Amazon Web Services authorized partnership enabling hybrid cloud deployments and AWS workload integration.",
  },
  {
    name: "Microsoft Azure",
    badge: "Authorized Partner",
    desc: "Microsoft Azure authorized partnership for hybrid cloud, enterprise workload integration, and Azure ecosystem support.",
  },
  {
    name: "Google Cloud",
    badge: "Partner",
    desc: "Google Cloud partnership enabling GCP workload integration and multi-cloud deployment models.",
  },
  {
    name: "Oracle Cloud",
    badge: "Partner",
    desc: "Oracle Cloud partnership for enterprise database workloads, Oracle ecosystem integration, and hybrid Oracle deployments.",
  },
] as const;

export default function CompanyPartnersPage() {
  return (
    <main className="min-w-0">
      <section className="bg-[#0A0A0A] pb-20 pt-[140px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="ECOSYSTEM PARTNERS" />
          <h1 className="mt-5 max-w-[900px] font-sans text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white sm:text-[48px] md:text-[56px]">
            Built on authorized partnerships.
          </h1>
          <p className="mt-6 max-w-[560px] font-sans text-[18px] font-normal leading-[1.65] text-[#6B6B6B]">
            Racko Cloud combines owned data centre infrastructure with authorized partnerships across leading cloud and
            AI platforms - giving customers a complete, accountable cloud portfolio.
          </p>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="INFRASTRUCTURE PARTNER" />
          <h2 className="mt-4 font-sans text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white md:text-[44px]">
            Webyne Data Centre
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="font-sans text-base font-normal leading-[1.7] text-[#6B6B6B]">
                Racko Cloud is powered by Webyne Data Centre - providing owned and controlled data centre infrastructure
                across Mumbai, Noida, and Chennai. Webyne&apos;s facilities form the physical backbone of Racko&apos;s cloud
                product portfolio.
              </p>
              <p className="mt-5 font-sans text-base font-normal leading-[1.7] text-[#6B6B6B]">
                This partnership gives Racko customers local cloud control, data sovereignty inside India, and the
                predictable economics of data-centre-backed cloud - not hyperscaler rental.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <span className="rounded border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-4 py-2 font-mono text-[10px] text-[#A1A1A1]">
                  Mumbai - Cloud DC
                </span>
                <span className="rounded border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-4 py-2 font-mono text-[10px] text-[#A1A1A1]">
                  Noida - Cloud DC
                </span>
                <span className="rounded border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-4 py-2 font-mono text-[10px] text-[#A1A1A1]">
                  Chennai - Cloud DC
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {infrastructureSpecs.map((spec) => (
                <div key={spec} className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-5">
                  <p className="font-sans text-[15px] font-semibold text-white">{spec}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0A0A0A] py-24">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <div className="mx-auto max-w-[900px] text-center">
            <Eyebrow label="CLOUD & AI PARTNERS" centered />
            <h2 className="mt-4 font-sans text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white md:text-[44px]">
              Authorized cloud partnerships.
            </h2>
            <p className="mx-auto mt-5 max-w-[560px] font-sans text-base font-normal leading-[1.7] text-[#6B6B6B]">
              Racko Cloud holds authorized partnerships with leading cloud and AI platforms - enabling hybrid cloud,
              AI-ready deployments, and workload portability across environments.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            {cloudPartners.map((item) => (
              <article
                key={item.name}
                className="rounded-[6px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] px-8 py-8 text-center"
              >
                <h3 className="font-sans text-[28px] font-extrabold text-white">{item.name}</h3>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-crimson-500">{item.badge}</p>
                <p className="mt-4 font-sans text-sm font-normal leading-[1.7] text-[#6B6B6B]">{item.desc}</p>
              </article>
            ))}
          </div>

          <div className="mt-12 border-t border-[rgba(255,255,255,0.08)] pt-8 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#3D3D3D]">AI PLATFORM PARTNERS</p>
            <div className="mt-4 flex items-center justify-center gap-10">
              <span className="font-sans text-base font-semibold text-[rgba(255,255,255,0.4)] transition-colors duration-150 hover:text-[rgba(255,255,255,0.8)]">
                OpenAI
              </span>
              <span className="font-sans text-base font-semibold text-[rgba(255,255,255,0.4)] transition-colors duration-150 hover:text-[rgba(255,255,255,0.8)]">
                Anthropic
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-20 text-center">
        <div className="mx-auto w-full max-w-[900px] px-4 sm:px-6">
          <h2 className="font-sans text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white md:text-[40px]">
            Interested in partnering with Racko?
          </h2>
          <p className="mx-auto mt-4 max-w-[620px] font-sans text-base font-normal leading-[1.7] text-[#6B6B6B]">
            Technology partners, resellers, and system integrators - reach out to discuss partnership opportunities.
          </p>
          <Link
            href="/company/contact"
            className="mt-8 inline-flex items-center justify-center rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-[#DC2626]"
          >
            Contact Racko -&gt;
          </Link>
        </div>
      </section>
    </main>
  );
}
