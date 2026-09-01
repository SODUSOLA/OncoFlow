import { ConversationRepository, TranscriptionAssignmentRepository } from "../repository.js";
import { Conversation } from "../entities/Conversation.js";
import { TranscriptionAssignment } from "../entities/TranscriptionAssignment.js";
import { notificationService } from "../../notification/index.js";

const conversationRepo = new ConversationRepository();
const transcriptionAssignmentRepo = new TranscriptionAssignmentRepository();

export class MessagingJobService {
  // Previously run only on an external schedule that was never wired up (no queue infra —
  // same gap CountdownJobService's decrementActiveCases() had). Now invoked lazily as a
  // side effect of MessagingService.listMessages (same pattern as markReadForViewer/
  // markDeliveredForViewer there) — this sweeps every open, unanswered, overdue conversation
  // globally on any single thread read, not just the one being viewed. Slightly redundant
  // per-call, but needs zero new scheduling infrastructure.
  async sweepSlaBreaches() {
    const overdue = await conversationRepo.findOverdueUnbreached();
    const results: { id: string; breached: boolean }[] = [];

    for (const row of overdue) {
      const entity = new Conversation(row).checkBreach(new Date());
      if (entity.slaBreached) {
        await conversationRepo.update(row.id, { slaBreached: true });
        // An unassigned conversation has no one to notify — not an error, just nothing to do.
        if (entity.assignedTo) {
          await notificationService.create({ recipientId: entity.assignedTo, type: "SLA_BREACH" }).catch((err) => {
            console.error(`SLA breach notification failed for conversation ${row.id}:`, err);
          });
        }
      }
      results.push({ id: row.id, breached: entity.slaBreached });
    }

    return results;
  }

  // F3.11 §5 — mirrors sweepSlaBreaches() above. Unlike the MO/Admin SLA breach gaps flagged
  // in the trigger-web doc, this one has a defined recipient from the start per the role
  // definition: whoever manages the scribe pool — no dedicated "scribe lead" role exists yet,
  // so that's SUPER_ADMIN for now. Actual notification delivery is the same pending hook noted
  // on TranscriptionAssignmentService.finalize() (Notification module still an empty scaffold).
  async sweepTranscriptionSlaBreaches() {
    const overdue = await transcriptionAssignmentRepo.findOverdueUnbreached();
    const results: { id: string; breached: boolean }[] = [];

    for (const row of overdue) {
      const entity = new TranscriptionAssignment(row).checkBreach(new Date());
      if (entity.slaBreached) {
        await transcriptionAssignmentRepo.update(row.id, { slaBreached: true });
      }
      results.push({ id: row.id, breached: entity.slaBreached });
    }

    return results;
  }
}
