import { db } from "../../db/index.js";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { triageQuestion, triageSession, triageAnswer, specialistEscalation } from "./schema.js";

// The timestamp columns hold UTC without a zone, and raw SQL hands them back as bare strings that `new Date()`
// would read as local time (an hour off in Lagos). Normalising here keeps every raw read correct.
export function utc(v: Date | string | null): Date | null {
  if (v === null) return null;
  if (v instanceof Date) return v;
  return new Date(/[zZ]|[+-]\d\d(:?\d\d)?$/.test(v) ? v : `${v.replace(" ", "T")}Z`);
}

// Data access for the triage checklist.
export class TriageRepository {
  // Active questions in the order they're answered.
  async findActiveQuestions() {
    return db.select().from(triageQuestion).where(eq(triageQuestion.isActive, true)).orderBy(asc(triageQuestion.position));
  }

  async findSession(id: string) {
    const rows = await db.select().from(triageSession).where(eq(triageSession.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findSessionByConversation(conversationId: string, vmoId: string) {
    const rows = await db.select().from(triageSession)
      .where(and(eq(triageSession.conversationId, conversationId), eq(triageSession.vmoId, vmoId))).limit(1);
    return rows[0] ?? null;
  }

  // Idempotent on (conversation, vmo): a concurrent double-start returns the same row.
  async createSession(data: typeof triageSession.$inferInsert) {
    await db.insert(triageSession).values(data).onConflictDoNothing();
    return (await this.findSessionByConversation(data.conversationId, data.vmoId))!;
  }

  async findAnswers(sessionId: string) {
    return db.select().from(triageAnswer).where(eq(triageAnswer.triageSessionId, sessionId));
  }

  // The unique (session, question) index makes a repeated answer a no-op instead of an overwrite.
  async insertAnswer(data: typeof triageAnswer.$inferInsert): Promise<boolean> {
    const rows = await db.insert(triageAnswer).values(data).onConflictDoNothing().returning({ id: triageAnswer.id });
    return rows.length > 0;
  }

  async completeSession(id: string) {
    await db.update(triageSession).set({ completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(triageSession.id, id), sql`${triageSession.completedAt} IS NULL`));
  }
}

// Data access for the VMO's chat inbox. Raw SQL for the patient join, for the same module-boundary reason as below.
export class InboxRepository {
  // The VMO's side-effect chats with the patient mini-card fields (name, ID, age only), the last message, and
  // whether this VMO has finished the triage checklist for each.
  async listForVmo(vmoId: string) {
    return db.execute<{
      id: string; status: string; slaDeadline: Date | null; slaBreached: boolean; firstResponseAt: Date | null; createdAt: Date;
      firstName: string; lastName: string; uniquePatientId: string; dob: string; lastMessage: string | null; lastMessageAt: Date | null;
      triageCompleted: boolean; unreadCount: number;
    }>(sql`
      SELECT c.id, c.status::text AS status, c.sla_deadline AS "slaDeadline", c.sla_breached AS "slaBreached",
             c.first_response_at AS "firstResponseAt", c.created_at AS "createdAt",
             p.first_name AS "firstName", p.last_name AS "lastName", p.unique_patient_id AS "uniquePatientId", p.dob::text AS dob,
             (SELECT m.content FROM message m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessage",
             (SELECT m.created_at FROM message m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessageAt",
             EXISTS (SELECT 1 FROM triage_session ts WHERE ts.conversation_id = c.id AND ts.vmo_id = ${vmoId} AND ts.completed_at IS NOT NULL) AS "triageCompleted",
             (SELECT COUNT(*)::int FROM message mu WHERE mu.conversation_id = c.id AND mu.sender_id = p.user_id
                AND mu.status::text <> 'READ' AND mu.type::text <> 'SYSTEM') AS "unreadCount"
      FROM conversation c
      JOIN patient p ON p.id = c.patient_id
      WHERE c.is_deleted = false AND c.conversation_type = 'MO_SIDE_EFFECT' AND c.assigned_to = ${vmoId}
      ORDER BY COALESCE((SELECT MAX(m.created_at) FROM message m WHERE m.conversation_id = c.id), c.created_at) DESC
    `);
  }
}

// Open side-effect chats nobody has taken yet (newest first, so a fresh report is never buried), shown to every VMO with the same mini-card (name, ID, age only).
export class UnclaimedRepository {
  async list() {
    return db.execute<{
      id: string; slaDeadline: Date | null; slaBreached: boolean; createdAt: Date;
      firstName: string; lastName: string; uniquePatientId: string; dob: string; lastMessage: string | null; lastMessageAt: Date | null; unreadCount: number;
    }>(sql`
      SELECT c.id, c.sla_deadline AS "slaDeadline", c.sla_breached AS "slaBreached", c.created_at AS "createdAt",
             (SELECT COUNT(*)::int FROM message mu WHERE mu.conversation_id = c.id AND mu.sender_id = p.user_id
                AND mu.status::text <> 'READ' AND mu.type::text <> 'SYSTEM') AS "unreadCount",
             p.first_name AS "firstName", p.last_name AS "lastName", p.unique_patient_id AS "uniquePatientId", p.dob::text AS dob,
             (SELECT m.content FROM message m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessage",
             (SELECT m.created_at FROM message m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessageAt"
      FROM conversation c
      JOIN patient p ON p.id = c.patient_id
      WHERE c.is_deleted = false AND p.is_deleted = false AND c.conversation_type = 'MO_SIDE_EFFECT' AND c.status = 'OPEN' AND c.assigned_to IS NULL
      ORDER BY COALESCE((SELECT MAX(m.created_at) FROM message m WHERE m.conversation_id = c.id), c.created_at) DESC
      LIMIT 200
    `);
  }
}

// Data access for specialist escalations. Joins to patient/facility/user use raw SQL, as the module boundary rules
// forbid importing other modules' schema from a repository.
export class EscalationRepository {
  async findById(id: string) {
    const rows = await db.select().from(specialistEscalation).where(eq(specialistEscalation.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findOpenByPatientAndReason(patientId: string, reason: string) {
    const rows = await db.select().from(specialistEscalation).where(and(
      eq(specialistEscalation.patientId, patientId),
      eq(specialistEscalation.triggerReason, reason),
      ne(specialistEscalation.status, "RESOLVED"),
    )).limit(1);
    return rows[0] ?? null;
  }

  async create(data: typeof specialistEscalation.$inferInsert) {
    const rows = await db.insert(specialistEscalation).values(data).returning();
    return rows[0]!;
  }

  async updateStatus(id: string, status: "NOTIFIED" | "CONSULT_SCHEDULED" | "RESOLVED") {
    const rows = await db.update(specialistEscalation).set({ status, updatedAt: new Date() })
      .where(eq(specialistEscalation.id, id)).returning();
    return rows[0] ?? null;
  }

  // Escalations for patients in the given facilities (null = all), open first then newest.
  async listForFacilities(facilityIds: string[] | null, status?: string) {
    if (facilityIds && facilityIds.length === 0) return [];
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT e.id, e.patient_id AS "patientId", e.trigger_reason AS "triggerReason", e.trigger_reference AS "triggerReference",
             e.status, e.created_at AS "createdAt", e.updated_at AS "updatedAt",
             p.first_name AS "firstName", p.last_name AS "lastName", p.unique_patient_id AS "uniquePatientId",
             p.facility_id AS "facilityId",
             u.first_name AS "escalatorFirstName", u.last_name AS "escalatorLastName", u.email AS "escalatorEmail"
      FROM specialist_escalation e
      JOIN patient p ON p.id = e.patient_id
      JOIN "user" u ON u.id = e.escalated_by
      WHERE (${facilityIds === null} OR p.facility_id IN (${facilityIds && facilityIds.length ? sql.join(facilityIds.map((f) => sql`${f}::uuid`), sql`, `) : sql`NULL`}))
        AND (${status ?? null}::text IS NULL OR e.status::text = ${status ?? null})
      ORDER BY (e.status = 'RESOLVED'), e.created_at DESC
    `);
    return rows.map((r) => ({ ...r, createdAt: utc(r.createdAt as string), updatedAt: utc(r.updatedAt as string) }));
  }

  // Ids to notify: Clinical Directors and Regional Admins in the patient's facility's region. A director with
  // no facility is a state/national account and is always included.
  async findNotificationRecipients(patientFacilityId: string): Promise<{ id: string; role: string }[]> {
    const rows = await db.execute<{ id: string; role: string }>(sql`
      SELECT DISTINCT u.id, r.name::text AS role FROM "user" u
      JOIN user_role ur ON ur.user_id = u.id
      JOIN role r ON r.id = ur.role_id
      LEFT JOIN facility uf ON uf.id = u.facility_id
      WHERE u.is_deleted = false AND (
        (r.name::text = 'REGIONAL_ADMIN' AND uf.region = (SELECT region FROM facility WHERE id = ${patientFacilityId}))
        OR (r.name::text IN ('STATE_CLINICAL_DIRECTOR', 'NATIONAL_CLINICAL_DIRECTOR')
            AND (u.facility_id IS NULL OR uf.region = (SELECT region FROM facility WHERE id = ${patientFacilityId})))
      )
    `);
    return [...rows];
  }
}
