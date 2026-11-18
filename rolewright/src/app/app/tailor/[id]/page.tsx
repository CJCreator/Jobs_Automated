import type { Metadata } from "next";
import { ReviewView } from "@/components/review-view";

export const metadata: Metadata = { title: "Review suggestions" };

export default async function TailoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewView id={id} />;
}
