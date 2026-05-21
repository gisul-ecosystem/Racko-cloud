"use client";

import { motion } from "framer-motion";

interface UseCaseBlockProps {
  number: string;
  title: string;
  archetypes: string;
  background?: string;
  industryReq?: string[];
  challengesSolved?: string[];
  rackoStack?: string[];
  outcomes?: string[];
  columns?: {
    industryReq: string[];
    challengesSolved: string[];
    rackoStack: string[];
    outcomes: string[];
  };
  isEven?: boolean;
}

function Column({
  heading,
  items,
  prefixColor,
  className,
}: {
  heading: string;
  items: string[];
  prefixColor: string;
  className?: string;
}) {
  return (
    <div
      className={`px-6 py-6 first:pt-0 lg:py-0 lg:px-7 lg:first:pl-0 lg:last:pr-0 ${className ?? ""}`}
    >
      <p className="mb-5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#3D3D3D]">
        {heading}
      </p>
      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2">
            <span
              className="mt-0.5 shrink-0 font-mono text-[10px]"
              style={{ color: prefixColor }}
            >
              {">"}
            </span>
            <span className="min-w-0 break-words font-sans text-[13px] leading-[1.6] text-[#A1A1A1]">
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UseCaseBlock({
  number,
  title,
  archetypes,
  background,
  industryReq,
  challengesSolved,
  rackoStack,
  outcomes,
  columns,
  isEven = false,
}: UseCaseBlockProps) {
  const resolvedIndustryReq = industryReq ?? columns?.industryReq ?? [];
  const resolvedChallengesSolved = challengesSolved ?? columns?.challengesSolved ?? [];
  const resolvedRackoStack = rackoStack ?? columns?.rackoStack ?? [];
  const resolvedOutcomes = outcomes ?? columns?.outcomes ?? [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="border-t border-[rgba(255,255,255,0.06)] py-20"
      style={{ background: background ?? (isEven ? "#0A0A0A" : "#0E0E0E") }}
    >
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-[11px] font-medium text-crimson-500">
              {number}
            </p>
            <h2 className="mt-2 max-w-[760px] font-sans text-[28px] font-bold leading-[1.2] text-white">
              {title}
            </h2>
          </div>
          <div className="max-w-[300px] text-left lg:text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#3D3D3D]">
              REFERENCE ARCHETYPES
            </p>
            <p className="mt-1 font-sans text-[12px] text-[#6B6B6B]">
              {archetypes}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 border-[rgba(255,255,255,0.06)] lg:grid-cols-4 lg:divide-x lg:divide-[rgba(255,255,255,0.06)]">
          <Column
            heading="INDUSTRY REQUIREMENT"
            items={resolvedIndustryReq}
            prefixColor="#B91C1C"
            className="border-t border-[rgba(255,255,255,0.06)] lg:border-t-0"
          />
          <Column
            heading="CHALLENGES SOLVED"
            items={resolvedChallengesSolved}
            prefixColor="#B91C1C"
            className="border-t border-[rgba(255,255,255,0.06)] lg:border-t-0"
          />
          <Column
            heading="RACKO STACK"
            items={resolvedRackoStack}
            prefixColor="#B91C1C"
            className="border-t border-[rgba(255,255,255,0.06)] lg:border-t-0"
          />
          <Column
            heading="OUTCOMES"
            items={resolvedOutcomes}
            prefixColor="#D97706"
            className="border-t border-[rgba(255,255,255,0.06)] lg:border-t-0"
          />
        </div>
      </div>
    </motion.section>
  );
}
