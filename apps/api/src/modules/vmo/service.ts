import crypto from "node:crypto";
import { TriageRepository, EscalationRepository, InboxRepository, UnclaimedRepository, utc } from "./repository.js";
import { SpecialistEscalation } from "./entities/SpecialistEscalation.js";
import { ConversationRepository, ParticipantRepository, MessagingService } from "../messaging/index.js";
import { PatientRepository } from "../patient/index.js";
import { RegimenService, VitalsService, ClinicalMetricsService } from "../clinical-metrics/index.js";
import { drugSupplyService } from "../drug-supply/index.js";
import { notificationService } from "../notification/index.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { accessibleFacilityIds } from "../../lib/facility-scope.js";
import { vitalTypeEnum } from "../../db/enums.js";

const triageRepo = new TriageRepository();
const escalationRepo = new EscalationRepository();
const inboxRepo = new InboxRepository();
const unclaimedRepo = new UnclaimedRepository();
const conversationRepo = new ConversationRepository();
const participantRepo = new ParticipantRepository();
const messagingService = new MessagingService();
const patientRepo = new PatientRepository();
const regimenSvc = new RegimenService();
const vitalsSvc = new VitalsService();
const metricsSvc = new ClinicalMetricsService();

export const NO_CHECKLIST_MESSAGE = "Complete the triage checklist for this chat before opening the patient folder";

export type SlaState = "CRITICAL" | "WARNING" | "STABLE" | "RESOLVED";

// The last stretch of the window before a breach reads as WARNING.
const WARNING_WINDOW_MS = 60_000;

// One status per thread, derived here from the conversation's own fields so the four visual states can't drift apart.
export function slaStateFor(c: { status: string; slaBreached: boolean; slaDeadline: Date | null; firstResponseAt: Date | null }, now = new Date()): SlaState {
  if (c.status === "CLOSED") return "RESOLVED";
  if (c.slaBreached) return "CRITICAL";
  // Once the VMO has replied the clock has been met; only an unanswered thread can still breach.
  if (c.firstResponseAt || !c.slaDeadline) return "STABLE";
  const left = c.slaDeadline.getTime() - now.getTime();
  return left <= 0 ? "CRITICAL" : left <= WARNING_WINDOW_MS ? "WARNING" : "STABLE";
}

function ageFromDob(dob: string, now = new Date()): number {
  const d = new Date(dob);
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}

// The chat a VMO is working: must be an OPEN side-effect chat they're on. This is the "active chat only" rule —
// a VMO has no standing access to patients, only to the one in front of them.
async function loadActiveChat(conversationId: string, vmoId: string) {
  const convo = await conversationRepo.findById(conversationId);
  if (!convo || convo.conversationType !== "MO_SIDE_EFFECT") throw new NotFoundError("Side-effect chat not found");
  const onIt = convo.assignedTo === vmoId || await participantRepo.isParticipant(conversationId, vmoId);
  if (!onIt) throw new ForbiddenError("You are not on this chat");
  if (convo.status !== "OPEN") throw new ConflictError("This chat is closed");
  return convo;
}

// Business logic for the VMO's mandatory triage checklist, the gated patient folder and specialist escalation.
export class VmoService {
  // The VMO's chats, each with one SLA state, for the inbox and dashboard. The patient appears only as the
  // mini-card (name, ID, age): clinical detail stays behind the checklist.
  async inbox(vmoId: string) {
    const rows = await inboxRepo.listForVmo(vmoId);
    const asDate = utc;
    return rows.map((r) => ({
      id: r.id, status: r.status,
      slaState: slaStateFor({ status: r.status, slaBreached: r.slaBreached, slaDeadline: asDate(r.slaDeadline), firstResponseAt: asDate(r.firstResponseAt) }),
      slaDeadline: asDate(r.slaDeadline), createdAt: asDate(r.createdAt),
      lastMessage: r.lastMessage, lastMessageAt: asDate(r.lastMessageAt), triageCompleted: r.triageCompleted, unreadCount: r.unreadCount,
      patient: { firstName: r.firstName, lastName: r.lastName, uniquePatientId: r.uniquePatientId, age: ageFromDob(r.dob) },
    }));
  }

  // Side-effect reports still waiting for a VMO, oldest first; any VMO may take one.
  async unclaimed() {
    const rows = await unclaimedRepo.list();
    return rows.map((r) => ({
      id: r.id,
      slaState: slaStateFor({ status: "OPEN", slaBreached: r.slaBreached, slaDeadline: utc(r.slaDeadline), firstResponseAt: null }),
      slaDeadline: utc(r.slaDeadline), createdAt: utc(r.createdAt),
      lastMessage: r.lastMessage, lastMessageAt: utc(r.lastMessageAt), unreadCount: r.unreadCount,
      patient: { firstName: r.firstName, lastName: r.lastName, uniquePatientId: r.uniquePatientId, age: ageFromDob(r.dob) },
    }));
  }

  // Takes an unclaimed report. Only one VMO can win; the winner is assigned and joins the chat, which is what gives
  // them (and only them) access to the triage checklist and the chat-scoped patient folder.
  async claim(conversationId: string, vmoId: string) {
    const claimed = await conversationRepo.claimSideEffect(conversationId, vmoId);
    if (!claimed) throw new ConflictError("This report was already taken by another VMO, or it has closed");
    if (!(await participantRepo.isParticipant(conversationId, vmoId))) {
      await participantRepo.create({ conversationId, userId: vmoId });
    }
    return { id: claimed.id, status: claimed.status, assignedTo: claimed.assignedTo };
  }

  // The signed URL of a photo or voice note in a side-effect chat the VMO is on. Open or closed, but never someone else's chat.
  async attachmentUrl(conversationId: string, messageId: string, vmoId: string, forceDownload = false) {
    const convo = await conversationRepo.findById(conversationId);
    if (!convo || convo.conversationType !== "MO_SIDE_EFFECT") throw new NotFoundError("Side-effect chat not found");
    const onIt = convo.assignedTo === vmoId || await participantRepo.isParticipant(conversationId, vmoId);
    if (!onIt) throw new ForbiddenError("You are not on this chat");
    return messagingService.attachmentUrl(conversationId, messageId, forceDownload);
  }

  // Starts (or resumes) the caller's checklist for a chat and returns questions with progress.
  async startTriage(conversationId: string, vmoId: string) {
    const convo = await loadActiveChat(conversationId, vmoId);
    const session = await triageRepo.createSession({
      id: crypto.randomUUID(), conversationId, patientId: convo.patientId, vmoId,
    });
    return this.triageState(session.id);
  }

  // Records the next answer, in order, completing the session on the last one.
  async answer(sessionId: string, vmoId: string, questionId: string, answer: boolean) {
    const session = await triageRepo.findSession(sessionId);
    if (!session || session.vmoId !== vmoId) throw new NotFoundError("Triage session not found");
    // Re-checked on every answer: a chat closed or reassigned mid-checklist can't be finished.
    await loadActiveChat(session.conversationId, vmoId);
    if (session.completedAt) throw new ConflictError("This checklist is already complete");

    const questions = await triageRepo.findActiveQuestions();
    const answered = new Set((await triageRepo.findAnswers(sessionId)).map((a) => a.triageQuestionId));
    const next = questions.find((q) => !answered.has(q.id));
    if (!next) throw new ConflictError("There are no questions left to answer");
    // Server-enforced order: the wizard is linear on purpose, so a skipped question can't be back-filled.
    if (next.id !== questionId) throw new ConflictError("Questions must be answered in order");

    await triageRepo.insertAnswer({ id: crypto.randomUUID(), triageSessionId: sessionId, triageQuestionId: questionId, answer });
    if (questions.every((q) => answered.has(q.id) || q.id === questionId)) await triageRepo.completeSession(sessionId);
    return this.triageState(sessionId);
  }

  // Questions (with guidance), the caller's answers and whether the folder is unlocked.
  async triageState(sessionId: string) {
    const session = (await triageRepo.findSession(sessionId))!;
    const [questions, answers] = await Promise.all([triageRepo.findActiveQuestions(), triageRepo.findAnswers(sessionId)]);
    const answerByQuestion = new Map(answers.map((a) => [a.triageQuestionId, a.answer]));
    return {
      sessionId: session.id,
      conversationId: session.conversationId,
      completed: session.completedAt !== null,
      completedAt: session.completedAt,
      answered: questions.filter((q) => answerByQuestion.has(q.id)).length,
      total: questions.length,
      questions: questions.map((q) => ({
        id: q.id, position: q.position, prompt: q.prompt, impactContext: q.impactContext,
        affirmativeLabel: q.affirmativeLabel, negativeLabel: q.negativeLabel,
        protocolReference: q.protocolReference, differentialDiagnosis: q.differentialDiagnosis,
        requiredEvidence: q.requiredEvidence,
        answer: answerByQuestion.has(q.id) ? answerByQuestion.get(q.id)! : null,
      })),
    };
  }

  // The single gate for the folder, medication triage and escalation: an OPEN chat the caller is on, whose
  // checklist they finished. Returns the patient id. A question added after completion doesn't relock a finished
  // session (completion is stamped once), but an empty question bank never completes, so it fails closed.
  async assertFolderUnlocked(conversationId: string, vmoId: string) {
    const convo = await loadActiveChat(conversationId, vmoId);
    const session = await triageRepo.findSessionByConversation(conversationId, vmoId);
    if (!session?.completedAt) throw new ForbiddenError(NO_CHECKLIST_MESSAGE);
    return { patientId: convo.patientId, triageSessionId: session.id };
  }

  // The unlocked Patient Folder: identity, vitals, latest labs and regimen.
  async getFolder(conversationId: string, vmoId: string) {
    const { patientId } = await this.assertFolderUnlocked(conversationId, vmoId);
    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow) throw new NotFoundError("Patient not found");
    const [regimen, vitals, metrics] = await Promise.all([
      regimenSvc.getForPatient(patientId), vitalsSvc.getLatestForPatient(patientId), metricsSvc.getCurrentForPatient(patientId),
    ]);
    return {
      patient: {
        id: patientRow.id, uniquePatientId: patientRow.uniquePatientId, firstName: patientRow.firstName,
        lastName: patientRow.lastName, dob: patientRow.dob, gender: patientRow.gender,
      },
      regimen, vitals, clinicalMetrics: metrics,
    };
  }

  // Read-aggregation only: drugs used, last labs and vital timelines. A list of cards, so more can be added.
  async getMedicationTriage(conversationId: string, vmoId: string) {
    const { patientId } = await this.assertFolderUnlocked(conversationId, vmoId);
    const [drugsUsed, metrics, trends] = await Promise.all([
      drugSupplyService.listUsageForPatient(patientId),
      metricsSvc.getCurrentForPatient(patientId),
      Promise.all(vitalTypeEnum.enumValues.map(async (t) => ({ vitalType: t, readings: await vitalsSvc.getTrendForPatient(patientId, t, 30) }))),
    ]);
    return {
      cards: [
        { key: "drugsUsed", title: "Drugs used", data: drugsUsed },
        { key: "lastLabs", title: "Last lab results", data: metrics },
        { key: "vitalTimelines", title: "Vital timelines", data: trends },
      ],
    };
  }

  // VMO-initiated hand-off to a Specialist Oncologist. Not gated by Clinical Director approval: directors are
  // notified for awareness, Regional Admins to act (schedule the virtual consult).
  async escalate(conversationId: string, vmoId: string, triggerReason: string, triggerReference?: string) {
    const { patientId, triageSessionId } = await this.assertFolderUnlocked(conversationId, vmoId);
    if (triggerReference) {
      const metrics = await metricsSvc.getCurrentForPatient(patientId);
      // Lab values aren't individually addressable, so the reference is the current results snapshot they belong to.
      if (metrics?.id !== triggerReference) throw new ConflictError("That reference isn't this patient's current results");
    }
    if (await escalationRepo.findOpenByPatientAndReason(patientId, triggerReason)) {
      throw new ConflictError("This patient already has an open escalation for that reason");
    }
    const row = await escalationRepo.create({
      id: crypto.randomUUID(), patientId, escalatedBy: vmoId, conversationId, triageSessionId,
      triggerReason, triggerReference: triggerReference ?? null,
    });
    const patientRow = await patientRepo.findById(patientId);
    if (patientRow?.facilityId) {
      const recipients = await escalationRepo.findNotificationRecipients(patientRow.facilityId);
      await Promise.all(recipients.map((r) => notificationService.create({ recipientId: r.id, type: "SPECIALIST_ESCALATION" }).catch(() => {})));
    }
    return row;
  }

  // Escalations for the caller's region (Regional Admin acts on these; Clinical Directors watch).
  async listEscalations(callerId: string, status?: string) {
    return escalationRepo.listForFacilities(await accessibleFacilityIds(callerId), status);
  }

  // Regional Admin moves an escalation forward (consult scheduled, resolved), inside their region only.
  async updateEscalationStatus(id: string, callerId: string, next: "CONSULT_SCHEDULED" | "RESOLVED") {
    const row = await escalationRepo.findById(id);
    if (!row) throw new NotFoundError("Escalation not found");
    const scope = await accessibleFacilityIds(callerId);
    if (scope) {
      const patientRow = await patientRepo.findById(row.patientId);
      if (!patientRow?.facilityId || !scope.includes(patientRow.facilityId)) throw new ForbiddenError("This escalation is outside your region");
    }
    try {
      new SpecialistEscalation(row.status).transitionTo(next);
    } catch (err) {
      throw new ConflictError(err instanceof Error ? err.message : "Invalid transition");
    }
    return (await escalationRepo.updateStatus(id, next))!;
  }
}

export const vmoService = new VmoService();
