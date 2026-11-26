/**
 * Room the chart rail needs between the Path library and the bottom bar.
 * Magnifier is 8.5rem open / 3rem collapsed. The +24 is the 1rem gap above the bar and 0.5rem under the library.
 * railPillStack is the three pills above the magnifier (three 3rem pills, two 0.5rem gaps, 0.5rem before the magnifier).
 * Keep it in step with .node-pills in globals.css.
 */
export const railPillStack = 168;

const widgetNeeds = { open: 136 + 24 + railPillStack, collapsed: 48 + 24 + railPillStack };

/** True when the widget would overlap the sticky Path library stack, so it is hidden until there is room. */
export function widgetCrowded(room: number | null, open: boolean): boolean {
  if (room == null) return false;
  return room < (open ? widgetNeeds.open : widgetNeeds.collapsed);
}

