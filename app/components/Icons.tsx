// Набор от изчистени SVG икони (line style, наследяват currentColor)
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (props: P) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const PinIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" />
    <circle cx="12" cy="11" r="2.2" />
  </svg>
);

export const CompassIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </svg>
);

export const LandmarkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 21h18" />
    <path d="M12 3 4 8h16l-8-5Z" />
    <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
  </svg>
);

export const FoodIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 3v7a2 2 0 0 0 4 0V3M7 3v18" />
    <path d="M17 3c-1.7 0-3 2-3 5s1.3 4 3 4v9" />
  </svg>
);

export const SparkleIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
  </svg>
);

export const ClockIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const CameraIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);

export const SpeakerIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M16 9a3.5 3.5 0 0 1 0 6" />
    <path d="M18.5 7a7 7 0 0 1 0 10" />
  </svg>
);

export const GlobeIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
  </svg>
);

export const RefreshIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 4v5h-5" />
  </svg>
);

export const WarningIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
);

export const BookIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
    <path d="M5 17a3 3 0 0 1 3-3h11" />
  </svg>
);

export const SearchIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const ChevronIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const CheckIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m5 12 5 5L20 7" />
  </svg>
);
