import type { Metadata } from "next";
import AssessmentPageContent from "./AssessmentPageContent";

export const metadata: Metadata = {
  title: "Book a Racko Meet — Racko",
  description:
    "Tell us about one priority workload. Racko will review your infrastructure and define the right target model.",
};

export default function AssessmentPage() {
  return <AssessmentPageContent />;
}
