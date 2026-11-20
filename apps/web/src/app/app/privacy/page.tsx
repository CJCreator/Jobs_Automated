import type { Metadata } from "next";
import { signOut } from "@/auth";
import { DeleteAccount } from "@/components/delete-account";
import { ExportData } from "@/components/export-data";
import { DeleteResumeText } from "@/components/delete-resume-text";
import { PrivacyNotice } from "@/components/privacy-notice";

export const metadata: Metadata = { title: "Privacy notice" };
export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default function PrivacyPage() {
  return (
    <div className="space-y-8">
      <PrivacyNotice />

      <ExportData />

      <DeleteResumeText />

      <DeleteAccount signOutAction={signOutAction} />
    </div>
  );
}
