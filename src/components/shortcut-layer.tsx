"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type ShortcutEntry = {
  id: string;
  key: string;
  label: string;
  index: number;
  run: () => void;
};

type ShortcutContextValue = {
  show: boolean;
  register: (entry: ShortcutEntry) => void;
  unregister: (id: string) => void;
};

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

const legacyShortcuts: { keys: string[]; label: string }[] = [
  { keys: ["Esc"], label: "Close dialog" },
  { keys: ["↑", "↓"], label: "Resize the bottom panel" },
  { keys: ["Arrows"], label: "Scroll the chart" },
  { keys: ["⌘ or Shift", "scroll"], label: "Zoom the chart" },
  { keys: ["⌘", "Shift", "drag"], label: "Zoom the chart" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select"));
}

export function pickShortcutLetter(label: string, taken: Set<string>): { key: string; index: number } | null {
  for (let index = 0; index < label.length; index += 1) {
    const key = label[index].toLowerCase();
    if (key < "a" || key > "z" || taken.has(key)) continue;
    return { key, index };
  }
  return null;
}

export function ShortcutLayer({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  const [entries, setEntries] = useState<ShortcutEntry[]>([]);
  const entriesRef = useRef<ShortcutEntry[]>([]);
  entriesRef.current = entries;
  const register = useCallback((entry: ShortcutEntry) => {
    setEntries((current) => [...current.filter((item) => item.id !== entry.id), entry]);
  }, []);
  const unregister = useCallback((id: string) => {
    setEntries((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    let shiftTimer: number | null = null;
    const clearShiftTimer = () => {
      if (shiftTimer == null) return;
      window.clearTimeout(shiftTimer);
      shiftTimer = null;
    };
    const hide = () => {
      clearShiftTimer();
      setShow(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
        hide();
        return;
      }
      const namedModifier = event.key === "Control" || event.key === "Alt" || event.key === "Meta";
      if (namedModifier || event.ctrlKey || event.altKey || event.metaKey) {
        clearShiftTimer();
        setShow(true);
        if (namedModifier || event.ctrlKey || event.altKey || event.metaKey) {
          if (namedModifier) return;
          if (event.ctrlKey || event.altKey || event.metaKey) return;
        }
      }
      if (event.key === "Shift" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (event.repeat) return;
        clearShiftTimer();
        shiftTimer = window.setTimeout(() => {
          shiftTimer = null;
          if (!isTypingTarget(document.activeElement)) setShow(true);
        }, 400);
        return;
      }
      if (event.shiftKey && event.key !== "Shift") clearShiftTimer();
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.key === "Add" ? "+" : event.key === "Subtract" ? "-" : event.key.toLowerCase();
      if (key.length !== 1) return;
      const hit = entriesRef.current.find((item) => item.key === key);
      if (!hit) return;
      event.preventDefault();
      hit.run();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") clearShiftTimer();
      if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isTypingTarget(event.target)) hide();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", hide);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      clearShiftTimer();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", hide);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  const letters = [...entries].sort((a, b) => a.key.localeCompare(b.key) || a.label.localeCompare(b.label));

  return (
    <ShortcutContext.Provider value={{ show, register, unregister }}>
      {children}
      <div className={show ? "shortcut-panel is-shown" : "shortcut-panel"} aria-hidden={show ? undefined : true}>
        <div className="shortcut-panel-card">
          {legacyShortcuts.map((item) => (
            <span key={item.label + item.keys.join()} className="shortcut-row">
              {item.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
              <span>{item.label}</span>
            </span>
          ))}
          {letters.map((item) => (
            <span key={item.id} className="shortcut-row">
              <kbd>{item.key.toUpperCase()}</kbd>
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      </div>
    </ShortcutContext.Provider>
  );
}

export function useShortcut(id: string, key: string, label: string, index: number, run: () => void, enabled = true) {
  const context = useContext(ShortcutContext);
  const runRef = useRef(run);
  runRef.current = run;
  const register = context?.register;
  const unregister = context?.unregister;
  useEffect(() => {
    if (!register || !unregister || !enabled || !key) return;
    register({ id, key, label, index, run: () => runRef.current() });
    return () => unregister(id);
  }, [enabled, id, index, key, label, register, unregister]);
}

export function ShortcutText({ text, index }: { text: string; index: number }) {
  const context = useContext(ShortcutContext);
  if (!context?.show || index < 0 || index >= text.length) return text;
  return (
    <>
      {text.slice(0, index)}
      <span className="shortcut-mark">{text[index]}</span>
      {text.slice(index + 1)}
    </>
  );
}

export function ShortcutTip({ label, index, children }: { label: string; index: number; children: ReactNode }) {
  const context = useContext(ShortcutContext);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = Boolean(context?.show);
  const popId = useId();
  useLayoutEffect(() => {
    if (!show) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const button = anchor.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    let top = button.bottom + gap;
    let left = button.left;
    if (top + box.height > window.innerHeight - margin) top = button.top - box.height - gap;
    if (left + box.width > window.innerWidth - margin) left = button.right - box.width;
    if (left < margin) left = margin;
    if (top < margin) top = Math.min(button.bottom + gap, window.innerHeight - margin - box.height);
    setPos({ left, top });
  }, [show, label, index]);
  return (
    <span ref={anchorRef} className="shortcut-anchor">
      {children}
      {show ? (
        <span
          ref={popRef}
          id={popId}
          className="shortcut-popover"
          role="tooltip"
          style={pos ?? { left: 0, top: 0, visibility: "hidden" }}
        >
          <ShortcutText text={label} index={index} />
        </span>
      ) : null}
    </span>
  );
}
