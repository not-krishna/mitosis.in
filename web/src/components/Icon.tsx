// @ts-nocheck
export function Icon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "sheet") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 10h16M4 16h16M10 4v16M16 4v16" />
      </svg>
    );
  }
  if (name === "mapping") {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="2.4" />
        <circle cx="17" cy="17" r="2.4" />
        <circle cx="17" cy="7" r="2.4" />
        <path d="M9.4 7h5.2M8.8 8.8l6.4 6.4" />
      </svg>
    );
  }
  if (name === "generate") {
    return (
      <svg {...common}>
        <path d="M8 5.2v13.6L18.5 12 8 5.2Z" />
      </svg>
    );
  }
  if (name === "scale") {
    return (
      <svg {...common}>
        <path d="M5 19 19 5M14 5h5v5M5 14v5h5" />
      </svg>
    );
  }
  if (name === "output") {
    return (
      <svg {...common}>
        <path d="M12 4v10M8 10l4 4 4-4" />
        <path d="M5 17.5h14" />
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
    );
  }
  if (name === "frame") {
    return (
      <svg {...common}>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    );
  }
  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4" />
      </svg>
    );
  }
  if (name === "plus") {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (name === "download") {
    return (
      <svg {...common}>
        <path d="M12 4v10M8 10l4 4 4-4" />
        <path d="M5 19h14" />
      </svg>
    );
  }
  if (name === "refresh") {
    return (
      <svg {...common}>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M18 9a6.5 6.5 0 0 0-11-2" />
        <path d="M6 15a6.5 6.5 0 0 0 11 2" />
      </svg>
    );
  }
  if (name === "plug") {
    return (
      <svg {...common}>
        <path d="M8 8v4a4 4 0 1 0 8 0V8" />
        <path d="M9 3v5M15 3v5M12 16v5" />
      </svg>
    );
  }
  if (name === "unlink") {
    return (
      <svg {...common}>
        <path d="m6 6 12 12" />
        <path d="M8.5 12.5 7 14a3 3 0 0 0 4.2 4.2l2-2" />
        <path d="m10.8 7.8 2-2A3 3 0 0 1 17 10l-1.5 1.5" />
      </svg>
    );
  }
  if (name === "sparkle") {
    return (
      <svg {...common}>
        <path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z" />
        <path d="M5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16Z" />
      </svg>
    );
  }
  if (name === "text") {
    return (
      <svg {...common}>
        <path d="M5 6h14M12 6v12M9 18h6" />
      </svg>
    );
  }
  if (name === "image") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m7 17 4.2-4.2a1.5 1.5 0 0 1 2.1 0L17 16.5" />
      </svg>
    );
  }
  if (name === "color") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg {...common}>
        <path d="m5 12 4 4 10-10" />
      </svg>
    );
  }
  if (name === "link") {
    return (
      <svg {...common}>
        <path d="M10 13a5 5 0 0 0 7.1.1l1.2-1.2a5 5 0 0 0-7.1-7.1L10 6" />
        <path d="M14 11a5 5 0 0 0-7.1-.1L5.7 12.1a5 5 0 0 0 7.1 7.1L14 18" />
      </svg>
    );
  }
  if (name === "trash-2") {
    return (
      <svg {...common}>
        <path d="M3 6h18M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6h18Z" />
      </svg>
    );
  }
  if (name === "refresh-cw") {
    return (
      <svg {...common}>
        <path
          xmlns="http://www.w3.org/2000/svg"
          d="M19.146 4.854l-1.489 1.489A8 8 0 1 0 12 20a8.094 8.094 0 0 0 7.371-4.886 1 1 0 1 0-1.842-.779A6.071 6.071 0 0 1 12 18a6 6 0 1 1 4.243-10.243l-1.39 1.39a.5.5 0 0 0 .354.854H19.5A.5.5 0 0 0 20 9.5V5.207a.5.5 0 0 0-.854-.353z"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
