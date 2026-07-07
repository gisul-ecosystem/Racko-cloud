"use client";

import { forwardRef } from "react";
import { clsx } from "clsx";
import type { ButtonProps as SharedButtonProps } from "@/types";

export type ButtonProps = SharedButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>;

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "border-transparent bg-[#B91C1C] text-white hover:-translate-y-[1px] hover:bg-[#DC2626]",
  secondary:
    "border border-[rgba(255,255,255,0.25)] bg-transparent text-white hover:bg-[rgba(255,255,255,0.06)]",
  ghost: "border-transparent bg-transparent p-0 text-[#6B6B6B] hover:text-white",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-[18px] py-2 text-[13px]",
  md: "px-7 py-[11px] text-[14px]",
  lg: "px-10 py-[14px] text-[15px]",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    arrow = false,
    href,
    className,
    children,
    ...props
  },
  ref
) {
  const resolvedVariant = variant as NonNullable<ButtonProps["variant"]>;

  const classes = clsx(
    "inline-flex items-center gap-2 rounded-[5px] font-sans font-medium transition-all duration-150 ease-in-out",
    variantClasses[resolvedVariant],
    resolvedVariant !== "ghost" && sizeClasses[size],
    className
  );

  const content = (
    <>
      {children}
      {arrow ? (
        <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "14px" }}>
          →
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    );
  }

  return (
    <button ref={ref} className={classes} {...props}>
      {content}
    </button>
  );
});

export default Button;
