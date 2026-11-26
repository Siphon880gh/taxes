/** Widget heights in px (8.5rem open, 3rem collapsed) plus its 1rem gap above the dock and 0.5rem under the Path library. */
const widgetNeeds = { open: 136 + 24, collapsed: 48 + 24 };

/** True when the widget would overlap the sticky Path library stack, so it is hidden until there is room. */
export function widgetCrowded(room: number | null, open: boolean): boolean {
  if (room == null) return false;
  return room < (open ? widgetNeeds.open : widgetNeeds.collapsed);
}

