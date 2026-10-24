import type { ReactNode } from "react";
import { CloseIcon } from "./icons.js";

export type NoticeTone = "warning" | "error";

export type NoticeProps = {
  tone: NoticeTone;
  testId?: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
};

/** One banner for every system-level message (offline, load failure, busy). It floats over the page, so it never moves the layout. */
export const Notice = ({ tone, testId, action, children }: NoticeProps) => (
  <div className={`notice notice-${tone}`} role="alert" data-testid={testId}>
    <span className="notice-mark" aria-hidden="true">
      {tone === "error" ? <CloseIcon /> : "!"}
    </span>
    <span className="notice-text">{children}</span>
    {action && (
      <button type="button" className="notice-action" onClick={action.onClick}>
        {action.label}
      </button>
    )}
  </div>
);

export const OfflineBanner = ({ visible }: { visible: boolean }) =>
  visible ? (
    <Notice tone="warning" testId="offline-banner">
      Cannot reach the checker. Reconnecting automatically... The instant board preview still works.
    </Notice>
  ) : null;

export const ErrorBanner = ({ message, onRetry }: { message: string | null; onRetry: () => void }) =>
  message ? (
    <Notice tone="error" action={{ label: "Retry", onClick: onRetry }}>
      {message}
    </Notice>
  ) : null;

export const HintBox = ({ hint, onClose }: { hint: string | null; onClose: () => void }) =>
  hint ? (
    <div className="hint-box" role="note" data-testid="hint-box">
      <span>
        <strong>Hint:</strong> {hint}
      </span>
      <button type="button" className="quiet" onClick={onClose} aria-label="Hide the hint">
        <CloseIcon />
      </button>
    </div>
  ) : null;
