import { Suspense } from "react";
import { PageFrame } from "@/components/page-frame";
import { OfferSimulator } from "@/components/negotiation/offer-simulator";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Offer Negotiation & Monte Carlo Simulator — career-ops",
  description: "Decompile complex tech compensation offers, simulate equity exit multiples, and generate 3-round counter-offer scripts.",
};

export default function NegotiationPage() {
  return (
    <PageFrame>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface/50" />}>
        <OfferSimulator />
      </Suspense>
    </PageFrame>
  );
}
