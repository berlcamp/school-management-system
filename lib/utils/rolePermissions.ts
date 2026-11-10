/**
 * Role Permissions matrix maths (migration 232), kept free of React so it can
 * be tested. A cell is (staff type, menu page). Its value is the saved row when
 * there is one, else the built-in default. A save sends only the cells that
 * changed, and a cell set back to its default is sent as `null` so the row is
 * deleted rather than kept as a copy of the default — "no row = default" stays
 * true, and a later change to the built-in menu reaches every untouched cell.
 */

export const cellKey = (userType: string, url: string) => `${userType}\u0000${url}`;

export interface MenuAccessRow {
  user_type: string;
  item_key: string;
  is_enabled: boolean;
}

export interface MenuAccessChange {
  user_type: string;
  item_key: string;
  /** null = back to the built-in default (delete the row). */
  is_enabled: boolean | null;
}

/** The ticked cells as the page should first show them. */
export function effectiveCells(
  userTypes: readonly string[],
  urls: readonly string[],
  defaults: ReadonlyMap<string, ReadonlySet<string>>,
  rows: readonly MenuAccessRow[],
): Set<string> {
  const saved = new Map(rows.map((r) => [cellKey(r.user_type, r.item_key), r.is_enabled]));
  const ticked = new Set<string>();
  for (const type of userTypes) {
    for (const url of urls) {
      const key = cellKey(type, url);
      const value = saved.get(key) ?? defaults.get(type)?.has(url) ?? false;
      if (value) ticked.add(key);
    }
  }
  return ticked;
}

/** What to send for a save, given the ticks as loaded and as they are now. */
export function diffCells(
  userTypes: readonly string[],
  urls: readonly string[],
  defaults: ReadonlyMap<string, ReadonlySet<string>>,
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): MenuAccessChange[] {
  const changes: MenuAccessChange[] = [];
  for (const type of userTypes) {
    for (const url of urls) {
      const key = cellKey(type, url);
      const now = after.has(key);
      if (now === before.has(key)) continue;
      const isDefault = (defaults.get(type)?.has(url) ?? false) === now;
      changes.push({ user_type: type, item_key: url, is_enabled: isDefault ? null : now });
    }
  }
  return changes;
}
