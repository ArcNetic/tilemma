import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "../src/components/ThemeToggle.js";
import { THEME_KEY, applyTheme, parseTheme, storedTheme } from "../src/lib/theme.js";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => localStorage.clear());

describe("theme", () => {
  it("defaults to light when nothing valid is saved, whatever the OS prefers", () => {
    expect(parseTheme(null)).toBe("light");
    expect(parseTheme("nonsense")).toBe("light");
    expect(storedTheme()).toBe("light");
  });

  it("lets a saved dark choice win over the default", () => {
    localStorage.setItem(THEME_KEY, "dark");
    expect(storedTheme()).toBe("dark");
  });

  it("reads a saved light theme", () => {
    localStorage.setItem(THEME_KEY, "light");
    expect(storedTheme()).toBe("light");
  });

  it("sets the theme attribute on the root element", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("ThemeToggle", () => {
  it("switches theme, applies it and remembers it", async () => {
    applyTheme("dark");
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to the light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "Switch to the dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });

  it("starts from the theme the page already applied", () => {
    applyTheme("light");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to the dark theme" })).toBeInTheDocument();
  });
});
