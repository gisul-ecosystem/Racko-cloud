import type { EyebrowProps } from "@/types";

export default function Eyebrow({ label, centered = false }: EyebrowProps) {
  return (
    <div
      className={`font-mono inline-flex items-center text-[11px] font-medium uppercase tracking-[0.1em] text-crimson-500 ${
        centered ? "justify-center" : "justify-start"
      }`}
    >
      <span>{label}</span>
    </div>
  );
}
