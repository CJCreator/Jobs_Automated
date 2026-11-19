import type { Metadata } from "next";
import { HomeView } from "@/components/home-view";
import { PageTitle } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: "Home" };

export default function AppHomePage() {
  return (
    <div className="space-y-6">
      <PageTitle>{en.app.home.title}</PageTitle>
      <HomeView />
    </div>
  );
}
