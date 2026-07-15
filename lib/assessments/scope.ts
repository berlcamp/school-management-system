/**
 * Assessment materials (CRLA / Phil-IRI / RMA) are authored either by the
 * division office or by an individual school:
 *   - school_id NULL -> division-authored, usable by every school
 *   - school_id set   -> school-authored, usable only by that school
 *
 * Pass the result to `.or()` on a materials query to get both sets for one
 * school. Migration 106.
 */
export const usableMaterialsFilter = (schoolId: number) =>
  `school_id.is.null,school_id.eq.${schoolId}`;
