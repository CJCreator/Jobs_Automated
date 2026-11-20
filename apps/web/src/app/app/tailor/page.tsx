import type { Metadata } from "next";
import { TailorForm } from "@/components/tailor-form";
import { PageTitle } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: "Tailor a resume" };

export default function TailorPage() {
  return (
    <div className="space-y-6">
      <PageTitle>{en.app.tailor.title}</PageTitle>
      <TailorForm />
    </div>
  );
}
