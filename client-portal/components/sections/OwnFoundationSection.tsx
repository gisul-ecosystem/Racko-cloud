"use client";

import { useRef, type MouseEvent } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { CheckCircle2 } from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;
const tiltSpring = { stiffness: 140, damping: 18, mass: 0.4 };

export default function OwnFoundationSection() {
  const reduceMotion = useReducedMotion();
  const graphicRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: graphicRef,
    offset: ["start end", "end start"],
  });
  const parallaxY = useSpring(useTransform(scrollYProgress, [0, 1], [30, -30]), {
    stiffness: 110,
    damping: 26,
    mass: 0.4,
  });

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-4.5, 4.5]), tiltSpring);
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [3.5, -3.5]), tiltSpring);

  const handlePointerMove = (event: MouseEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const handlePointerLeave = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  return (
    <section className="relative overflow-hidden bg-[#050505] py-16 sm:py-20 lg:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 62%, rgba(140,20,20,0.30) 0%, transparent 66%), radial-gradient(ellipse 45% 40% at 4% 10%, rgba(120,18,18,0.22) 0%, transparent 60%), radial-gradient(ellipse 45% 45% at 98% 88%, rgba(120,18,18,0.20) 0%, transparent 62%)",
        }}
      />

      <div className="relative z-[1] mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: easeOut }}
            className="min-w-0"
          >
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.45, ease: easeOut }}
              className="inline-flex items-center rounded-full border border-[rgba(220,38,38,0.55)] bg-[rgba(80,12,12,0.5)] px-3.5 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-[#F87171]"
            >
              Why Racko
            </motion.span>
            <h2 className="mt-5 font-sans text-[clamp(28px,3.2vw,40px)] font-extrabold leading-[1.15] tracking-[-0.03em] text-white">
              Own The Foundation.
              <br />
              Keep The Freedom
            </h2>
            <p className="mt-4 font-sans text-[14px] leading-[1.6] text-[#8A8A8A]">
              Racko owned infrastructure, shaped around your workload.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: easeOut, delay: 0.12 }}
            className="group inline-flex shrink-0 items-center gap-3 self-start rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[#0B0B0C] px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,68,68,0.5)] hover:shadow-[0_16px_40px_rgba(185,28,28,0.22)] lg:mt-8"
          >
            <CheckCircle2
              className="h-5 w-5 shrink-0 text-[#DC2626] transition-transform duration-300 group-hover:scale-110"
              strokeWidth={1.6}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block font-sans text-[10px] text-[#6B6B6B]">Infrastructure</span>
              <span className="block font-sans text-[13px] font-bold text-white">
                Owned. Not rented.
              </span>
            </span>
          </motion.div>
        </div>

        <div className="-mx-4 mt-6 overflow-x-auto px-4 py-6 sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0">
          <motion.div
            ref={graphicRef}
            onMouseMove={handlePointerMove}
            onMouseLeave={handlePointerLeave}
            style={reduceMotion ? undefined : { y: parallaxY }}
            className="relative mx-auto w-full min-w-[820px] max-w-[1180px] lg:min-w-0"
          >
            <motion.span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[47%] aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[70px]"
              style={{
                background: "radial-gradient(circle, rgba(220,38,38,0.55) 0%, transparent 70%)",
              }}
              animate={reduceMotion ? undefined : { opacity: [0.4, 0.85, 0.4], scale: [0.94, 1.1, 0.94] }}
              transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[47%] aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.28] blur-[40px]"
              style={{
                background:
                  "conic-gradient(from 0deg, rgba(239,68,68,0) 0%, rgba(239,68,68,0.5) 30%, rgba(239,68,68,0) 62%)",
              }}
              animate={reduceMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
            />
            {[0, 1].map((ring) => (
              <motion.span
                key={ring}
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-[47%] aspect-square w-[13%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(239,68,68,0.45)]"
                initial={{ scale: 0.75, opacity: 0 }}
                animate={reduceMotion ? undefined : { scale: [0.75, 2.1], opacity: [0.5, 0] }}
                transition={{
                  duration: 4.2,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: ring * 2.1,
                }}
              />
            ))}

            <motion.div
              initial={{ opacity: 0, y: 26, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.8, ease: easeOut, delay: 0.1 }}
              style={
                reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 1400 }
              }
              className="relative"
            >
              <Image
                src="/images/Container.png"
                alt="Racko owned infrastructure core: your workload at the centre, connected to compute, data, cloud and operations, with workload-first design, predictable costs, zero lock-in and regional control"
                width={1600}
                height={588}
                sizes="(max-width: 1024px) 860px, 1180px"
                className="h-auto w-full select-none"
                draggable={false}
              />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
