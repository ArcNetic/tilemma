import { useState } from "react";
import { applyTheme, storedTheme, storeTheme, type Theme } from "../lib/theme.js";
import { MoonIcon, SunIcon } from "./icons.js";

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "light" ? "light" : storedTheme()));
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  };

  return (
    <button type="button" className="icon-button btn-ghost theme-toggle" onClick={toggle} title={`Switch to the ${next} theme`} data-testid="theme-toggle">
      {theme === "dark" ? <MoonIcon /> : <SunIcon />}
      <span className="visually-hidden">{`Switch to the ${next} theme`}</span>
    </button>
  );
};
