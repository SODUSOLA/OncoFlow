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
}
