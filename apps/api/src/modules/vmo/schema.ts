import { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { specialistEscalationStatusEnum } from "../../db/enums.js";
import { patient } from "../patient/schema.js";
import { user } from "../auth/schema.js";
import { conversation } from "../messaging/schema.js";

// The mandatory Yes/No triage instrument. Wording and guidance are data, not markup, since they read as
// clinical protocol content that can change without a deploy.
export const triageQuestion = pgTable("triage_question", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Ordering key: the checklist is answered in position order.
  position: integer("position").notNull(),
  prompt: text("prompt").notNull(),
  // The "Impact Card" shown above the two buttons.
  impactContext: text("impact_context").notNull(),
  affirmativeLabel: text("affirmative_label").notNull().default("Yes"),
  negativeLabel: text("negative_label").notNull().default("No"),
  // The Secondary Guidance Grid.
  protocolReference: text("protocol_reference").notNull(),
  differentialDiagnosis: text("differential_diagnosis").notNull(),
  requiredEvidence: text("required_evidence").notNull(),
  // Retired questions stay for old sessions' answers but no longer count toward completion.
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  activePositionUnique: uniqueIndex("triage_question_active_position_unique").on(t.position).where(sql`${t.isActive} = true`),
}));

// One VMO's run through the checklist for one chat. Completion of this row is what unlocks the patient folder.
export const triageSession = pgTable("triage_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversation.id),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  vmoId: uuid("vmo_id").notNull().references(() => user.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  conversationVmoUnique: uniqueIndex("triage_session_conversation_vmo_unique").on(t.conversationId, t.vmoId),
}));

// [append-only] An answer is never edited: a wrong answer means a clinical record was already made on it.
export const triageAnswer = pgTable("triage_answer", {
  id: uuid("id").primaryKey().defaultRandom(),
  triageSessionId: uuid("triage_session_id").notNull().references(() => triageSession.id),
  triageQuestionId: uuid("triage_question_id").notNull().references(() => triageQuestion.id),
  // true = the affirmative button.
  answer: boolean("answer").notNull(),
  answeredAt: timestamp("answered_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  sessionQuestionUnique: uniqueIndex("triage_answer_session_question_unique").on(t.triageSessionId, t.triageQuestionId),
}));

// A VMO-initiated hand-off to a Specialist Oncologist. Not gated by Clinical Director approval: the director is
// told (informational) and the Regional Admin is told (actionable — they schedule the virtual consult).
export const specialistEscalation = pgTable("specialist_escalation", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  escalatedBy: uuid("escalated_by").notNull().references(() => user.id),
  conversationId: uuid("conversation_id").references(() => conversation.id),
  triageSessionId: uuid("triage_session_id").references(() => triageSession.id),
  triggerReason: text("trigger_reason").notNull(),
  // Points at the value that triggered it (a clinical_metrics_snapshot or one of its lab values).
  triggerReference: uuid("trigger_reference"),
  status: specialistEscalationStatusEnum("status").notNull().default("NOTIFIED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  patientIdx: index("specialist_escalation_patient_idx").on(t.patientId, t.status),
}));
