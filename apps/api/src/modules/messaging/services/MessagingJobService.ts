import { ConversationRepository, TranscriptionAssignmentRepository } from "../repository.js";
import { Conversation } from "../entities/Conversation.js";
import { TranscriptionAssignment } from "../entities/TranscriptionAssignment.js";

const conversationRepo = new ConversationRepository();
const transcriptionAssignmentRepo = new TranscriptionAssignmentRepository();

export class MessagingJobService {
  // FR-31: run on a schedule (external cron/BullMQ — no queue infra wired up yet, same as
  // CountdownJobService's decrementActiveCases()). Flips sla_breached for every open,
  // unanswered conversation whose deadline has passed.
  async sweepSlaBreaches() {
    const overdue = await conversationRepo.findOverdueUnbreached();
    const results: { id: string; breached: boolean }[] = [];

    for (const row of overdue) {
      const entity = new Conversation(row).checkBreach(new Date());
      if (entity.slaBreached) {
        await conversationRepo.update(row.id, { slaBreached: true });
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
