/** Tiny original stroke icons (24×24 grid). Decorative: always paired with a text label. */

type IconName =
  | "dawn"
  | "day"
  | "dusk"
  | "night"
  | "relations"
  | "timeline"
  | "pause"
  | "play"
  | "birdseye"
  | "overview"
  | "tour"
  | "home"
  | "list"
  | "info"
  | "help"
  | "close"
  | "search";

const PATHS: Record<IconName, string> = {
  dawn: "M4 18h16M7 14a5 5 0 0 1 10 0M12 4v3M5.6 7.6l1.8 1.8M18.4 7.6l-1.8 1.8",
  day: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  dusk: "M4 18h16M7 14a5 5 0 0 1 10 0M12 10V4M9.5 6.5 12 4l2.5 2.5",
  night: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  relations: "M6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7.5 14.5 16.5 9.5",
  timeline: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  pause: "M9 5v14M15 5v14",
  play: "M8 5l11 7-11 7z",
  birdseye: "M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5",
  overview: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  tour: "M8 5l11 7-11 7z",
  home: "M7 17 17 7M9 7h8v8",
  list: "M4 6h16M4 12h16M4 18h16",
  info: "M12 11v6M12 7h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  help: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01",
  close: "M6 6l12 12M18 6 6 18",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
};

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
