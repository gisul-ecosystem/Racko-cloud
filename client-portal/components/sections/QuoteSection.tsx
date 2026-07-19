"use client";

import { motion } from "framer-motion";

export default function QuoteSection() {
  return (
    <section className="bg-[#0E0E0E] py-14 sm:py-20">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          viewport={{ once: true, margin: "-40px" }}
          className="mx-auto max-w-[780px] px-1 text-center sm:px-0"
        >
          <div className="mb-4 font-sans text-[clamp(3rem,18vw,5rem)] leading-[0.5] text-crimson-500 sm:mb-6">
            &quot;
          </div>
          <p className="font-sans text-[clamp(1.125rem,4.5vw,1.75rem)] font-semibold leading-[1.45] text-white">
            Racko gave us the operational simplicity of cloud on infrastructure we
            actually own. It changed how we think about our entire stack.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <span className="h-8 w-px bg-crimson-500" />
            <div className="text-left">
              <p className="font-sans text-sm font-semibold text-white">
                Raju Rajuladevi
              </p>
              <p className="font-mono text-[11px] text-[#6B6B6B]">
                VP Infrastructure · Straive
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
