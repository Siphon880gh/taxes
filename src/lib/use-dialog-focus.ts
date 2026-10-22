"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest("[aria-hidden='true'], [inert]") && el.getClientRects().length > 0,
  );
}

/**
 * Modal focus: move focus into the dialog when it opens (an element marked data-autofocus first),
 * keep Tab and Shift+Tab inside it, and return focus to whatever was focused before when it closes.
 * The dialog element should have tabIndex={-1} so it can hold focus when it has nothing focusable.
 */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = node.querySelector<HTMLElement>("[data-autofocus]") ?? focusableIn(node)[0] ?? node;
    first.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusableIn(node);
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      const active = document.activeElement;
      const outside = !(active instanceof Node) || !node.contains(active);
      if (event.shiftKey && (active === head || active === node || outside)) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && (active === tail || outside)) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
