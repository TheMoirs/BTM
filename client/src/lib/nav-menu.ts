// Page actions shown in the phone ☰ menu at the top right of the menu bar.
// A page (e.g. the organiser's Teams page) hands its items over with
// usePageMenuItems; the menu bar reads them with useNavMenuItems. On wider
// screens the page keeps its own buttons and the ☰ menu isn't shown.
import { useEffect, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";

export type NavMenuItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Shown in red (e.g. Clear all teams) */
  destructive?: boolean;
  disabled?: boolean;
};

let items: NavMenuItem[] = [];
const listeners = new Set<() => void>();

function setItems(next: NavMenuItem[]) {
  items = next;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Read by the menu bar */
export function useNavMenuItems() {
  return useSyncExternalStore(subscribe, () => items, () => items);
}

/** Called by a page; the items are removed again when the page closes */
export function usePageMenuItems(next: NavMenuItem[]) {
  useEffect(() => {
    setItems(next);
    return () => setItems([]);
  }, [next]);
}
