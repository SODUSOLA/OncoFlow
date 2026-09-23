import { ConversationRepository, TranscriptionAssignmentRepository } from "../repository.js";
import { Conversation } from "../entities/Conversation.js";
import { TranscriptionAssignment } from "../entities/TranscriptionAssignment.js";
import { notificationService } from "../../notification/index.js";

const conversationRepo = new ConversationRepository();
const transcriptionAssignmentRepo = new TranscriptionAssignmentRepository();

// Background sweeps for SLA breaches.
export class MessagingJobService {
  // Flips every overdue open conversation to breached; run lazily on any thread read since there's no scheduler.
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

  // Mirrors sweepSlaBreaches for transcription; the recipient is SUPER_ADMIN until a scribe-lead role exists, and delivery is still a pending hook.
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
