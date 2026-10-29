// Petites icônes au trait, de la même taille que celles de Puck (barre d'outils).
const Svg = ({ children }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconExpand = () => (
  <Svg>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </Svg>
);
export const IconCollapse = () => (
  <Svg>
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
  </Svg>
);
export const IconPen = () => (
  <Svg>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
);
export const IconImage = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </Svg>
);
export const IconReplace = () => (
  <Svg>
    <path d="M4 7h11M11 3l4 4-4 4M20 17H9M13 21l-4-4 4-4" />
  </Svg>
);
export const IconSettings = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
);
export const IconHistory = () => (
  <Svg>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
  </Svg>
);
export const IconDownload = () => (
  <Svg>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Svg>
);
export const IconGrid = () => (
  <Svg>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Svg>
);
export const IconList = () => (
  <Svg>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);
export const IconPlusSquare = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);
export const IconPalette = () => (
  <Svg>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.8-.3-.9.3-1.7 1.2-1.7H17a4 4 0 0 0 4-4c0-5-4-10.5-9-10.5Z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10" cy="7" r="1" />
    <circle cx="14.5" cy="7" r="1" />
    <circle cx="17" cy="11" r="1" />
  </Svg>
);
export const IconSparkles = () => (
  <Svg>
    <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2Z" />
    <path d="M19 3v4M21 5h-4M5 17v4M7 19H3" />
  </Svg>
);
export const IconSwap = () => (
  <Svg>
    <path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" />
  </Svg>
);
export const IconGauge = () => (
  <Svg>
    <path d="M12 14l4-4" />
    <path d="M3.3 17a9 9 0 1 1 17.4 0" />
  </Svg>
);
