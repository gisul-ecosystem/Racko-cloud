"use client";

import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import { useDemoModal } from "@/components/ui/DemoModalContext";

type BookDemoTriggerButtonProps = {
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  children?: ReactNode;
};

export default function BookDemoTriggerButton({
  size = "md",
  variant = "primary",
  className,
  children = "Book a Racko Meet",
}: BookDemoTriggerButtonProps) {
  const { openModal } = useDemoModal();

  return (
    <Button type="button" size={size} variant={variant} className={className} onClick={openModal}>
      {children}
    </Button>
  );
}
