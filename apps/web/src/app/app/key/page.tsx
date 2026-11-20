import type { Metadata } from "next";
import { KeyView } from "@/components/key-view";
import { PageTitle } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: "AI key" };

export default function KeyPage() {
  return (
    <div className="space-y-6">
      <PageTitle>{en.app.key.title}</PageTitle>
      <KeyView />
    </div>
  );
}
