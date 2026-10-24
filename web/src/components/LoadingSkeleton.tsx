export const LoadingSkeleton = () => (
  <div className="skeleton-workspace" aria-hidden="true">
    <div className="skeleton-col">
      <div className="skeleton skeleton-status" />
      <div className="skeleton skeleton-editor" />
      <div className="skeleton-row">
        <div className="skeleton skeleton-button" />
        <div className="skeleton skeleton-button" />
        <div className="skeleton skeleton-button" />
      </div>
    </div>
    <div className="skeleton-col">
      <div className="skeleton skeleton-board" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  </div>
);
