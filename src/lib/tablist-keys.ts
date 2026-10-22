import type { KeyboardEvent } from "react";

/**
 * Arrow-key support for a role="tablist": Left/Up and Right/Down move to the previous or next tab (wrapping),
 * Home and End jump to the ends. The tab that gets focus is also activated.
 */
export function onTabListKeyDown(event: KeyboardEvent<HTMLElement>): void {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')];
  const index = tabs.findIndex((tab) => tab === document.activeElement);
  if (index === -1 || tabs.length === 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + tabs.length) % tabs.length
          : (index + 1) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
}
