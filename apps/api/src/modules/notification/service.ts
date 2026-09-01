import { NotificationRepository } from "./repository.js";
import { getIo, isIoAttached } from "../../lib/socket.js";

// Plain strings (matches the notification.type varchar column, no DB enum) — one member per
// real domain event that creates a notification today. Extend this list as more events wire
// in; it's documentation of what actually fires, not a DB constraint.
export type NotificationType =
  | "INVOICE_PAID"
  | "APPOINTMENT_CONFIRMED"
  | "APPOINTMENT_RESCHEDULED"
  | "LAB_RESULT_REVIEWED"
  | "SLA_BREACH"
  | "CONVERSATION_FEEDBACK";

const notificationRepo = new NotificationRepository();

export class NotificationService {
  async create(data: { recipientId: string; type: NotificationType }) {
    const row = await notificationRepo.create({
      id: crypto.randomUUID(),
      recipientId: data.recipientId,
      type: data.type,
      status: "PENDING",
    });

    // Only when a real Socket.IO server exists (never in the test process) — this is what
    // finally closes the "status stays PENDING forever" gap this module had before real-time
    // existed: pushed live, then immediately marked SENT since delivery just happened.
    if (isIoAttached()) {
      getIo().to(`user:${data.recipientId}`).emit("notification:new", row);
      const sent = await notificationRepo.markSent(row.id);
      return sent ?? row;
    }

    return row;
  }
}

export const notificationService = new NotificationService();
