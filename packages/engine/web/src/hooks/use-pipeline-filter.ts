"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Application } from "@/lib/career-ops";
import { PIPELINE_TABS, pipelineTab, rowOnPipelineTab } from "@/lib/pipeline-navigation.mjs";
import { sortRows } from "@/lib/core/pipeline-sort.mjs";
import { isSearchOnlyWrite, queryWithLiveSearch } from "@/lib/list-search-sync.mjs";
import { useListSearch } from "@/lib/use-list-search";
import { companySearchText } from "@/lib/company-presentation.mjs";
import { scoreNum } from "@/lib/format";
import {
  normalizeView,
  parseViews,
} from "@/lib/pipeline-views.mjs";

export const SORT_KEYS = ["tracker", "company", "role", "score", "status", "date"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Tab = (typeof PIPELINE_TABS)[number];
export type SavedView = NonNullable<ReturnType<typeof normalizeView>>;

const VIEWS_KEY = "career-ops:pipeline-views";
const LAYOUT_KEY = "career-ops:pipeline-layout";

export function usePipelineFilter(applications: Application[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startNavigation] = useTransition();
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);

  const [layoutMode, setLayoutMode] = useState<"table" | "kanban">("table");
  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    try {
      const savedLayout = localStorage.getItem(LAYOUT_KEY);
      if (savedLayout === "kanban" || savedLayout === "table") setLayoutMode(savedLayout);

      const savedViews = localStorage.getItem(VIEWS_KEY);
      if (savedViews) setViews(parseViews(savedViews));
    } catch {
      // Non-blocking localStorage error
    }
  }, []);

  const changeLayoutMode = useCallback((mode: "table" | "kanban") => {
    setLayoutMode(mode);
    try {
      localStorage.setItem(LAYOUT_KEY, mode);
    } catch {
      // Non-blocking
    }
  }, []);

  // URL state
  const tab: Tab = pipelineTab(params.get("tab"));
  const visibleTab = isPending && pendingTab ? pendingTab : tab;
  const pMin = parseFloat(params.get("min") ?? "");
  const minFilter: number | null = Number.isFinite(pMin) ? pMin : null;
  const pSort = params.get("sort") ?? "";
  const sortKey: SortKey = (SORT_KEYS as readonly string[]).includes(pSort) ? (pSort as SortKey) : "score";
  const sortDir: 1 | -1 = params.get("dir") === "1" ? 1 : -1;
  const sort: { key: string; dir: 1 | -1 } = { key: sortKey, dir: sortDir };

  const qRef = useRef(params.get("q") ?? "");
  const commitParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const qs = queryWithLiveSearch(params.toString(), updates, qRef.current);
      if (qs === params.toString()) return false;
      const href = `${pathname}${qs ? `?${qs}` : ""}`;
      if (isSearchOnlyWrite(updates)) {
        router.replace(href, { scroll: false });
        return true;
      }
      if (Object.prototype.hasOwnProperty.call(updates, "tab")) {
        setPendingTab(updates.tab as Tab);
      }
      startNavigation(() => {
        router.push(href, { scroll: false });
      });
      return true;
    },
    [params, pathname, router],
  );

  const { q: searchQuery, setQ: setSearchQuery } = useListSearch(params, commitParams, qRef);
  qRef.current = searchQuery;

  // Filter and sort applications
  const filteredApplications = useMemo(() => {
    let result = applications;

    // 1. Tab filter
    if (visibleTab !== "ALL") {
      result = result.filter((app) => rowOnPipelineTab(app.status, visibleTab));
    }

    // 2. Minimum score filter
    if (minFilter !== null) {
      result = result.filter((app) => {
        const num = scoreNum(app.score);
        return Number.isFinite(num) && num >= minFilter;
      });
    }

    // 3. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((app) => {
        const text = `${companySearchText(app)} ${app.role} ${app.notes}`.toLowerCase();
        return text.includes(q);
      });
    }

    // 4. Sorting
    return sortRows(result, sort, scoreNum) as Application[];
  }, [applications, visibleTab, minFilter, searchQuery, sort]);

  return {
    tab: visibleTab,
    sort,
    minFilter,
    searchQuery,
    setSearchQuery,
    layoutMode,
    changeLayoutMode,
    commitParams,
    views,
    setViews,
    filteredApplications,
    isPending,
  };
}
