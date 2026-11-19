import type { Metadata } from "next";
import { ResumeView } from "@/components/resume-view";
import { PageTitle } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: "Resume and facts" };

export default function ResumePage() {
  return (
    <div className="space-y-6">
      <PageTitle>{en.app.resume.title}</PageTitle>
      <ResumeView />
    </div>
  );
}
