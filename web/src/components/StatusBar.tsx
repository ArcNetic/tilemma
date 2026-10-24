import type { StatusMessage } from "../lib/status.js";

export type StatusBarProps = {
  message: StatusMessage;
  leanMs: number | null;
  /** Short title shown above the message, for example "Proof failed". */
  heading?: string;
};

export const StatusBar = ({ message, leanMs, heading }: StatusBarProps) => (
  <div className={`status-bar tone-${message.tone}`} role="status" aria-live="polite" data-testid="status-bar">
    {heading && <strong className="status-heading">{heading}</strong>}
    <span className="status-text">{message.text}</span>
    {message.detail && <span className="status-detail">{message.detail}</span>}
    {leanMs !== null && leanMs > 0 && <span className="status-time">Lean {leanMs} ms</span>}
  </div>
);
