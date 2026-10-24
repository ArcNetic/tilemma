export type Theme = "dark" | "light";

export const THEME_KEY = "tilemma-theme";

export const DEFAULT_THEME: Theme = "light";

export const parseTheme = (value: string | null | undefined): Theme => (value === "light" || value === "dark" ? value : DEFAULT_THEME);

export const storedTheme = (): Theme => {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME;
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
