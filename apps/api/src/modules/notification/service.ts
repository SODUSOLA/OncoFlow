import { NotificationRepository } from "./repository.js";
import { getIo, isIoAttached } from "../../lib/socket.js";
import { pushToUser, emailIfSignedOut } from "./pushService.js";

// Plain strings matching the varchar column: one member per domain event that creates a notification today.
export type NotificationType =
  | "INVOICE_PAID"
  | "APPOINTMENT_CONFIRMED"
  | "APPOINTMENT_RESCHEDULED"
  | "LAB_RESULT_REVIEWED"
  | "SLA_BREACH"
  | "CONVERSATION_FEEDBACK"
  | "AVAILABILITY_CHANGED"
  | "APPOINTMENT_SCHEDULED"
  | "APPOINTMENT_REMINDER"
  | "NURSING_CASE_SUBMITTED"
  | "NURSING_CASE_REVIEWED"
  | "IDENTITY_MISMATCH_REPORTED"
  | "SPECIALIST_ESCALATION"
  | "COUNTDOWN_ESCALATION"
  | "NEW_MESSAGE";

const notificationRepo = new NotificationRepository();

// Business logic for creating and delivering notifications.
export class NotificationService {
  // Creates a notification and pushes it live over Socket.IO when available.
  async create(data: { recipientId: string; type: NotificationType }) {
    const row = await notificationRepo.create({
      id: crypto.randomUUID(),
      recipientId: data.recipientId,
      type: data.type,
      status: "PENDING",
    });

    // Off-screen delivery (devices that registered for push, then email for signed-out users) is best-effort
    // and never blocks or fails the event that caused the notification.
    void Promise.allSettled([pushToUser(data.recipientId, data.type), emailIfSignedOut(data.recipientId, data.type)]);

    // Pushed only when a Socket.IO server exists, then marked SENT since delivery just happened.
    if (isIoAttached()) {
      getIo().to(`user:${data.recipientId}`).emit("notification:new", row);
      const sent = await notificationRepo.markSent(row.id);
      return sent ?? row;
    }

    return row;
  }
}

export const notificationService = new NotificationService();
