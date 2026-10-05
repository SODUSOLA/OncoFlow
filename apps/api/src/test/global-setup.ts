import postgres from "postgres";

// The suite runs against the shared dev database, so everything it creates would otherwise pile up in the staff
// dashboards. After the run, rows created since it started are soft-deleted (inquiries are closed, as they have
// no soft-delete) — reversible, and it never touches rows that existed before the run began.
const url = process.env.DATABASE_URL ?? "postgresql://oncoflow:oncoflow_dev@localhost:5432/oncoflow";

export default async function setup() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) return undefined;
  const sql = postgres(url, { max: 1, prepare: false });
  const [row] = await sql<{ now: Date }[]>`select now() as now`;
  const now = row!.now;
  return async () => {
    try {
      await sql`update countdown_case set is_deleted = true, deleted_at = now() where is_deleted = false and created_at >= ${now}`;
      await sql`update patient set is_deleted = true, deleted_at = now() where is_deleted = false and created_at >= ${now}`;
      await sql`update facility set is_deleted = true, deleted_at = now() where is_deleted = false and created_at >= ${now}`;
      await sql`update public_inquiry set status = 'CLOSED' where status = 'OPEN' and created_at >= ${now}`;
    } finally {
      await sql.end();
    }
  };
}
