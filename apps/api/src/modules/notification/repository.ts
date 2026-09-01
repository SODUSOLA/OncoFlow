import { db } from "../../db/index.js";
import { eq, desc } from "drizzle-orm";
import { notification } from "./schema.js";

export class NotificationRepository {
  async findByRecipient(recipientId: string) {
    return db
      .select()
      .from(notification)
      .where(eq(notification.recipientId, recipientId))
      .orderBy(desc(notification.createdAt));
  }

  async create(data: typeof notification.$inferInsert) {
    const rows = await db.insert(notification).values(data).returning();
    return rows[0]!;
  }

  async markSent(id: string) {
    const rows = await db
      .update(notification)
      .set({ status: "SENT", sentAt: new Date() })
      .where(eq(notification.id, id))
      .returning();
    return rows[0] ?? null;
  }
}
