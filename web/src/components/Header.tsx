import type { PublicLevel } from "@pp/engine";
import { HelpIcon, LogoMark, StarIcon } from "./icons.js";
import { ThemeToggle } from "./ThemeToggle.js";

export type HeaderProps = {
  level: PublicLevel | null;
  stars: number;
  best: number | null;
  levelsOpen?: boolean;
  onOpenLevels: () => void;
  onHelp: () => void;
};

export const Header = ({ level, stars, best, levelsOpen = false, onOpenLevels, onHelp }: HeaderProps) => (
  <header className="app-header">
    {level && (
      <nav className="app-nav" aria-label="Primary">
        <button type="button" className="menu-toggle btn-ghost levels-button" onClick={onOpenLevels} aria-expanded={levelsOpen} aria-controls="level-drawer" title="Levels">
          <span className={levelsOpen ? "burger is-open" : "burger"} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="visually-hidden">Levels</span>
        </button>
      </nav>
    )}
    <a className="brand-link" href="/" aria-label="Tilemma home">
      <LogoMark className="brand-mark" />
      <h1 className="brand">Tilemma</h1>
    </a>
    {level && (
      <div className="level-info" data-testid="level-info">
        <div className="level-heading">
          <span className="level-number">Level {level.order}</span>
          <strong className="level-title">{level.title}</strong>
        </div>
        <div className="level-meta">
          <span className="mini-stars" role="img" aria-label={stars === 0 ? "not solved yet" : `${stars} stars`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= stars ? "on" : ""} aria-hidden="true">
                <StarIcon />
              </span>
            ))}
          </span>
          <span className="chip">{level.concept}</span>
          <span className="chip" title="The fewest lines that solve this level">Goal: {level.par} {level.par === 1 ? "line" : "lines"}</span>
          {best !== null && <span className="chip subtle" title="Your shortest solution so far">Your best: {best} {best === 1 ? "line" : "lines"}</span>}
        </div>
      </div>
    )}
    <div className="app-bar-end">
      {level && (
        <button type="button" className="icon-button btn-ghost" onClick={onHelp} title="How to play" data-testid="help-button">
          <HelpIcon />
          <span className="visually-hidden">How to play</span>
        </button>
      )}
      <ThemeToggle />
    </div>
  </header>
);
