import { LoadingBlock, Skeleton } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export function PageSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-2/3" />
      <LoadingBlock label={en.common.loading} lines={lines} />
    </div>
  );
}
