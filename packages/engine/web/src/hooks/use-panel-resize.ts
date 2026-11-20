"use client";

import { useEffect, useState } from "react";

export type PanelSize = "compact" | "wide" | "full";

const SIZE_KEY = "career-ops:assistant-size";
const SIZE_ORDER: PanelSize[] = ["compact", "wide", "full"];

const PANEL_CLASS: Record<PanelSize, string> = {
  compact: "bottom-5 right-5 h-[600px] max-h-[80vh] w-[400px] max-w-[calc(100vw-2.5rem)]",
  wide: "bottom-5 right-5 h-[85vh] w-[720px] max-w-[calc(100vw-2.5rem)]",
  full: "inset-4 h-auto w-auto",
};

const INPUT_MAX_PX: Record<PanelSize, number> = {
  compact: 128,
  wide: 240,
  full: 360,
};

const SIZE_LABEL: Record<PanelSize, string> = {
  compact: "Wider",
  wide: "Full screen",
  full: "Compact",
};

export function usePanelResize() {
  const [size, setSize] = useState<PanelSize>("compact");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIZE_KEY);
      if (stored === "compact" || stored === "wide" || stored === "full") {
        setSize(stored);
      }
    } catch {
      // Non-blocking localStorage error
    }
  }, []);

  const cycleSize = () => {
    const next = SIZE_ORDER[(SIZE_ORDER.indexOf(size) + 1) % SIZE_ORDER.length];
    setSize(next);
    try {
      localStorage.setItem(SIZE_KEY, next);
    } catch {
      // Non-blocking
    }
  };

  return {
    size,
    setSize,
    cycleSize,
    panelClass: PANEL_CLASS[size],
    inputMaxPx: INPUT_MAX_PX[size],
    sizeLabel: SIZE_LABEL[size],
  };
}

