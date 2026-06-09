// Inline all migration SQL into the bundle at build time.
// `import.meta.glob` with `?raw` reads each .sql file as a string.
const modules = import.meta.glob("/supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type MigrationFile = {
  filename: string;
  version: string;
  sql: string;
  bytes: number;
};

export const migrationFiles: MigrationFile[] = Object.entries(modules)
  .map(([path, sql]) => {
    const filename = path.split("/").pop() ?? path;
    const version = filename.split("_")[0] ?? filename;
    return { filename, version, sql, bytes: new Blob([sql]).size };
  })
  .sort((a, b) => a.filename.localeCompare(b.filename));
