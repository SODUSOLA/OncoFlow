import { db } from "../../db/index.js";
import { eq, desc } from "drizzle-orm";
import { notification } from "./schema.js";

// Data access for notifications.
export class NotificationRepository {
  // Lists a recipient's notifications, newest first.
  async findByRecipient(recipientId: string) {
    return db
      .select()
      .from(notification)
      .where(eq(notification.recipientId, recipientId))
      .orderBy(desc(notification.createdAt));
  }

  // Inserts a notification.
  async create(data: typeof notification.$inferInsert) {
    const rows = await db.insert(notification).values(data).returning();
    return rows[0]!;
  }

  // Marks a notification as sent.
  async markSent(id: string) {
    const rows = await db
      .update(notification)
      .set({ status: "SENT", sentAt: new Date() })
      .where(eq(notification.id, id))
      .returning();
    return rows[0] ?? null;
  }
}
