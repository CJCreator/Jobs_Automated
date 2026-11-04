import { doctorState } from "@/lib/career-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-process doctor check: reads prerequisite state directly via doctorState()
// without spawning a separate Node process on every page load.
export async function GET() {
  try {
    const doc = doctorState();
    return Response.json({
      available: true,
      onboardingNeeded: doc.onboardingNeeded,
      missing: doc.missing,
      warnings: [],
    });
  } catch {
    return Response.json({
      available: false,
      onboardingNeeded: false,
      missing: [],
      warnings: [],
    });
  }
}
