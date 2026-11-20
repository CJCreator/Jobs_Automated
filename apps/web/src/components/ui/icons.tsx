// A handful of inline icons. Always paired with real text, so each is aria-hidden.

import type { SVGProps } from "react";

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.1em"
      height="1.1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const AlertIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3.5l9.5 16.5h-19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Svg>
);
export const BlockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M6 6l12 12" />
  </Svg>
);
export const InfoIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5v.01" />
  </Svg>
);
export const EyeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const EyeOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6A16.5 16.5 0 002 12s3.5 7 10 7a9.700 9.700 0 004-.9" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </Svg>
);
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const UndoIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h9a7 7 0 010 14h-2" transform="translate(0 -3)" />
  </Svg>
);
