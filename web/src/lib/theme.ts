export type Theme = "dark" | "light";

export const THEME_KEY = "tilemma-theme";

export const systemTheme = (): Theme => {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
};

export const parseTheme = (value: string | null | undefined): Theme => (value === "light" || value === "dark" ? value : systemTheme());

export const storedTheme = (): Theme => {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return systemTheme();
  }
};

export const storeTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    return;
  }
};

export const applyTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
};
