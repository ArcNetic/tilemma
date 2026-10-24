import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const Icon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  />
);

export const SunIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </Icon>
);

export const MoonIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Icon>
);

export const HelpIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 17h.01" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const CopyIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const StarIcon = (props: IconProps) => (
  <Icon fill="currentColor" strokeWidth="1.5" {...props}>
    <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
  </Icon>
);

export const SkipBackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 5v14M18 6l-6 6 6 6" />
  </Icon>
);

export const StepBackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);

export const StepForwardIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const SkipForwardIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M18 5v14M6 6l6 6-6 6" />
  </Icon>
);

export const PlayIcon = (props: IconProps) => (
  <Icon fill="currentColor" strokeWidth="1.5" {...props}>
    <path d="M8 5.5v13l11-6.5z" />
  </Icon>
);

export const PauseIcon = (props: IconProps) => (
  <Icon fill="currentColor" strokeWidth="1.5" {...props}>
    <rect x="6.5" y="5" width="4" height="14" rx="1" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" />
  </Icon>
);

export const LogoMark = (props: IconProps) => (
  <svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" focusable="false" {...props}>
    <rect width="32" height="32" rx="7" fill="#2563eb" />
    <rect x="6" y="6" width="9" height="9" rx="2" fill="#fff" />
    <rect x="17" y="17" width="9" height="9" rx="2" fill="#fbbf24" />
    <rect x="17" y="6" width="9" height="9" rx="2" fill="#fff" fillOpacity="0.4" />
    <rect x="6" y="17" width="9" height="9" rx="2" fill="#fff" fillOpacity="0.4" />
  </svg>
);

export const CodeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
  </Icon>
);
