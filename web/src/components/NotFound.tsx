import { LogoMark } from "./icons.js";
import { ThemeToggle } from "./ThemeToggle.js";

export const NotFound = () => (
  <div className="app not-found">
    <header className="app-header">
      <a className="brand-link" href="/">
        <LogoMark className="brand-mark" />
        <span className="brand">Tilemma</span>
      </a>
      <div className="app-bar-end">
        <ThemeToggle />
      </div>
    </header>
    <main className="empty-main">
      <section className="empty-state" data-testid="not-found">
        <div className="empty-art" aria-hidden="true">
          <span className="empty-tile t1" />
          <span className="empty-tile t2" />
          <span className="empty-tile t3" />
          <span className="empty-tile t4" />
        </div>
        <p className="eyebrow">Error 404</p>
        <h1>This page slid off the board</h1>
        <p>The page you are looking for does not exist or has moved. Head back to the puzzles and pick up where you left off.</p>
        <button type="button" className="primary lg" onClick={() => window.location.assign("/")}>
          Back to the puzzles
        </button>
      </section>
    </main>
  </div>
);
