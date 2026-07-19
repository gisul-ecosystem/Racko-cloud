import type { Metadata } from "next";
import CloudLabsPageContent from "./CloudLabsPageContent";

export const metadata: Metadata = {
  title: "CloudLabs & Workspaces — Racko",
  description:
    "Self-provisioned cloud labs, sandboxes, AI workspaces, demo environments, event infrastructure, and LMS-integrated labs with governance, cost control, and managed lifecycle.",
};

export default function CloudLabsPage() {
  return <CloudLabsPageContent />;
}
