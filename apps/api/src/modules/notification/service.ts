import { NotificationRepository } from "./repository.js";
import { getIo, isIoAttached } from "../../lib/socket.js";

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
  | "APPOINTMENT_REMINDER";

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
