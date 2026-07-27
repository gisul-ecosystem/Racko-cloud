"use client";

import { motion } from "framer-motion";

const cities = [
  { label: "Mumbai · Cloud DC", x: "28%", y: "62%" },
  { label: "Noida · Cloud DC", x: "52%", y: "34%" },
  { label: "Chennai · Cloud DC", x: "66%", y: "74%" },
];

const partners = ["AWS", "GCP", "Azure", "Oracle", "OpenAI", "Anthropic"];

export default function FootprintSection() {
  return (
    <section className="min-h-0 overflow-x-hidden bg-[#030304] py-0">
      <div className="mx-auto grid w-full max-w-[1600px] items-center gap-10 px-4 py-12 sm:gap-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_1.4fr] lg:gap-20 lg:py-0 xl:px-8">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            CLOUD FOOTPRINT
          </p>
          <h2 className="mt-5 font-sans text-[clamp(36px,3.5vw,52px)] font-extrabold leading-[1.1] text-white">
            Racko Cloud across India.
          </h2>
          <p className="mt-5 max-w-[620px] font-sans text-[16px] font-normal leading-[1.7] text-[#6B6B6B]">
            Racko Cloud operates from data centres across Mumbai, Noida, and Chennai — giving
            enterprises local cloud control, data sovereignty inside Indian jurisdiction, and
            predictable economics backed by authorized cloud partnerships.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {cities.map((city) => (
              <div
                key={city.label}
                className="group cursor-pointer rounded-[4px] border border-[rgba(255,255,255,0.1)] bg-[#1A1A1A] px-5 py-2.5 transition-all duration-150 hover:border-[#B91C1C]"
              >
                <p className="font-sans text-[13px] font-semibold text-white transition-colors duration-150 group-hover:text-white">
                  {city.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">
              CLOUD & AI PARTNERS
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-6">
              {partners.map((partner) => (
                <span
                  key={partner}
                  className="cursor-default font-sans text-[14px] font-semibold text-[rgba(255,255,255,0.45)] transition-colors duration-200 hover:text-[rgba(255,255,255,0.6)]"
                >
                  {partner}
                </span>
              ))}
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative flex min-h-[280px] w-full items-center justify-center sm:min-h-[400px] lg:-mr-8 lg:min-h-[500px] xl:-mr-16 xl:min-h-[500px]"
        >
          <div className="relative flex min-h-[280px] h-full w-full items-center justify-center overflow-hidden sm:min-h-[400px] lg:min-h-[500px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/india-map.png"
              alt="Racko Cloud across India — Mumbai, Noida, Chennai cloud data centres"
              className="block h-auto min-h-0 w-full max-w-full object-contain object-center sm:object-right lg:min-h-[500px]"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
