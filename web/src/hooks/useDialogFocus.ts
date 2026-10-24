import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const visibleFocusables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getAttribute("aria-hidden") !== "true" && getComputedStyle(el).visibility !== "hidden");

/**
 * Keeps keyboard focus inside a dialog while it is open: moves focus in (to the element marked
 * data-autofocus, else the first control), wraps Tab at both ends, closes on Escape, and gives focus
 * back to whatever had it before when the dialog closes.
 */
export const useDialogFocus = (open: boolean, container: RefObject<HTMLElement | null>, onClose?: () => void): void => {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const root = container.current;
    if (!root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const initial = root.querySelector<HTMLElement>("[data-autofocus]") ?? visibleFocusables(root)[0] ?? root;
    initial.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && close.current) {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = visibleFocusables(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, container]);
};
