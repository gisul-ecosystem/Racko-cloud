import { clsx } from "clsx";

interface SectionWrapperProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
  background?: "default" | "dark" | "darkest";
  paddingY?: "sm" | "md" | "lg";
}

const backgroundClasses: Record<NonNullable<SectionWrapperProps["background"]>, string> = {
  default: "bg-[#0E0E0E]",
  dark: "bg-[#1A1A1A]",
  darkest: "bg-[#0A0A0A]",
};

const paddingClasses: Record<NonNullable<SectionWrapperProps["paddingY"]>, string> = {
  sm: "py-[56px] md:py-[80px]",
  md: "py-[80px] md:py-[120px]",
  lg: "py-[120px] md:py-[160px]",
};

export default function SectionWrapper({
  children,
  id,
  className,
  background = "default",
  paddingY = "md",
}: SectionWrapperProps) {
  return (
    <section id={id} className={clsx(backgroundClasses[background], paddingClasses[paddingY], className)}>
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </section>
  );
}
