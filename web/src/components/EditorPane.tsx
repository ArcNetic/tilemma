import type { ReactNode } from "react";

export type EditorPaneProps = {
  title: string;
  className?: string;
  errorCount?: number;
  actions?: ReactNode;
  children: ReactNode;
};

export const EditorPane = ({ title, className, errorCount = 0, actions, children }: EditorPaneProps) => (
  <section className={className ? `pane ${className}` : "pane"} aria-label={title}>
    <div className="pane-head">
      <h2>{title}</h2>
      {errorCount > 0 && <span className="pane-count">{errorCount === 1 ? "1 error" : `${errorCount} errors`}</span>}
      {actions && <div className="pane-actions">{actions}</div>}
    </div>
    {children}
  </section>
);
