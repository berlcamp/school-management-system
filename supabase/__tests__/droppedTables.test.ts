import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// Guards against querying a table a migration has already dropped. Such a query
// fails at runtime with PostgREST's PGRST205 ("Could not find the table ... in
// the schema cache"), which nothing in the type system catches: table names
// reach supabase.from() as plain strings.

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const sourceDirs = ["app", "components", "hooks", "lib", "types"];

// Replays the migrations in filename order and returns the tables left dropped.
// A drop followed by a re-create in a later (or the same) migration does not
// count — 102_aral_tutors.sql drops and rebuilds sms_aral_tutors in one file.
const droppedTables = (): Set<string> => {
  const dropped = new Set<string>();

  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");

    for (const [, table] of sql.matchAll(
      /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?procurements\.(\w+)/gi,
    )) {
      dropped.add(table);
    }
    for (const [, table] of sql.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?procurements\.(\w+)/gi,
    )) {
      dropped.delete(table);
    }
  }

  return dropped;
};

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name.startsWith(".")
        ? []
        : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

describe("dropped tables", () => {
  it("are not referenced by application code", () => {
    const dropped = droppedTables();
    expect(dropped.size).toBeGreaterThan(0);

    const offenders: string[] = [];

    for (const dir of sourceDirs) {
      for (const file of sourceFiles(path.join(repoRoot, dir))) {
        const lines = readFileSync(file, "utf8").split("\n");
        for (const table of dropped) {
          // Only a quoted occurrence matters: that is how a table name reaches
          // supabase.from(). Prose mentioning a dropped table is fine, and is
          // in fact how the migration that dropped it gets explained.
          const quoted = new RegExp(`["'\`]${table}["'\`]`);
          lines.forEach((line, index) => {
            if (!quoted.test(line)) return;
            const relative = path.relative(repoRoot, file);
            offenders.push(`${relative}:${index + 1} queries ${table}`);
          });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
