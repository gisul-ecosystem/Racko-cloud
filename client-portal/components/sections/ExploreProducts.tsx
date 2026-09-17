"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { ArrowUpRight, Cloud, Code2, Cpu, Database, Settings, type LucideIcon } from "lucide-react";

type ProductTile = {
  title: string;
  description: string;
  href: string;
  Icon: LucideIcon;
};

const easeOut = [0.22, 1, 0.36, 1] as const;

const tiles: ProductTile[] = [
  {
    title: "Compute",
    description: "Flexible virtual machines for websites, apps and growing workloads.",
    href: "/products/vps",
    Icon: Cpu,
  },
  {
    title: "Cloud",
    description: "GPU AND private cloud environment",
    href: "/products/gpu-cloud",
    Icon: Cloud,
  },
  {
    title: "Storage & Backup",
    description: "Storage for your applications backups",
    href: "/products/s3-storage",
    Icon: Database,
  },
  {
    title: "Hosting & Labs",
    description: "Web Hosting and learning environments",
    href: "/products/web-hosting",
    Icon: Code2,
  },
  {
    title: "Managed Ops",
    description: "Support For the cloud Operations",
    href: "/products/managed-ops",
    Icon: Settings,
  },
];

export default function ExploreProducts() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-[#050505] py-16 sm:py-20 lg:py-24">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={reduceMotion ? undefined : { opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse 45% 55% at 88% 100%, rgba(185,28,28,0.22) 0%, transparent 62%)",
        }}
      />

      <div className="relative z-[1] mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: easeOut }}
        >
          <motion.p
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.45, ease: easeOut }}
            className="font-sans text-[10px] font-medium uppercase tracking-[0.12em] text-[#DC2626]"
          >
            Explore Products
          </motion.p>
          <h2 className="mt-4 font-sans text-[clamp(26px,2.9vw,38px)] font-extrabold leading-[1.15] tracking-[-0.03em] text-white">
            Infrastructure for everything you&rsquo;re building.
          </h2>
          <p className="mt-3 font-sans text-[14px] leading-[1.6] text-[#8A8A8A]">
            Explore flexible compute, cloud and storage solutions built for every workload
          </p>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:mt-12 lg:grid-cols-5 lg:gap-[18px]">
          {tiles.map((tile, index) => (
            <ProductTileCard key={tile.title} tile={tile} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductTileCard({ tile, index }: { tile: ProductTile; index: number }) {
  const { title, description, href, Icon } = tile;
  const reduceMotion = useReducedMotion();

  const mouseX = useMotionValue(-200);
  const mouseY = useMotionValue(-200);
  const spotlight = useMotionTemplate`radial-gradient(240px circle at ${mouseX}px ${mouseY}px, rgba(239,68,68,0.22), transparent 72%)`;

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - rect.left);
    mouseY.set(event.clientY - rect.top);
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: easeOut, delay: index * 0.07 }}
      whileHover={
        reduceMotion ? undefined : { y: -10, transition: { type: "spring", stiffness: 300, damping: 22 } }
      }
      onMouseMove={handleMouseMove}
      className="group"
    >
      <Link
        href={href}
        className="relative flex h-full min-h-[190px] flex-col overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.09)] bg-[linear-gradient(160deg,#131313_0%,#0B0B0B_100%)] p-5 transition-[border-color,box-shadow] duration-300 hover:border-[rgba(239,68,68,0.7)] hover:shadow-[0_26px_64px_rgba(185,28,28,0.3)] sm:p-6"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,#1A0A0A_0%,#0B0708_55%,#160909_100%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: spotlight }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-[linear-gradient(90deg,transparent,#EF4444,transparent)] transition-transform duration-500 ease-out group-hover:scale-x-100"
        />

        <span className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-transparent bg-transparent transition-all duration-300 group-hover:border-[rgba(239,68,68,0.35)] group-hover:bg-[rgba(220,38,38,0.14)]">
          <Icon
            className="h-[22px] w-[22px] shrink-0 text-[#D4D4D4] transition-[color,transform] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-110 group-hover:text-[#EF4444]"
            strokeWidth={1.6}
            aria-hidden
          />
        </span>

        <h3 className="relative mt-4 font-sans text-[21px] font-bold leading-[1.15] tracking-[-0.02em] text-white transition-transform duration-300 ease-out group-hover:translate-x-0.5">
          {title}
        </h3>
        <p className="relative mt-2.5 font-sans text-[12.5px] leading-[1.55] text-[#8A8A8A] transition-colors duration-300 group-hover:text-[#B0B0B0]">
          {description}
        </p>

        <span className="relative mt-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center self-end rounded-full border border-[rgba(255,255,255,0.16)] text-white transition-all duration-300 group-hover:border-transparent group-hover:bg-[#DC2626] group-hover:shadow-[0_8px_22px_rgba(220,38,38,0.45)]">
          <ArrowUpRight
            className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:translate-x-1"
            strokeWidth={1.8}
            aria-hidden
          />
        </span>
      </Link>
    </motion.div>
  );
}
