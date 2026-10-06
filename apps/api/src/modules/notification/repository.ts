import { db } from "../../db/index.js";
import { eq, desc, and, ne, notInArray } from "drizzle-orm";
import { notification, pushSubscription } from "./schema.js";

// Data access for notifications.
export class NotificationRepository {
  // Lists a recipient's notifications, newest first.
  async findByRecipient(recipientId: string, opts: { excludeTypes?: string[] } = {}) {
    const exclude = opts.excludeTypes?.length ? notInArray(notification.type, opts.excludeTypes) : undefined;
    return db
      .select()
      .from(notification)
      .where(and(eq(notification.recipientId, recipientId), exclude))
      .orderBy(desc(notification.createdAt));
  }

  // Inserts a notification.
  async create(data: typeof notification.$inferInsert) {
    const rows = await db.insert(notification).values(data).returning();
    return rows[0]!;
  }

  // Marks one of the recipient's own notifications as read; false when it isn't theirs or doesn't exist.
  async markRead(id: string, recipientId: string): Promise<boolean> {
    const rows = await db
      .update(notification)
      .set({ status: "READ" })
      .where(and(eq(notification.id, id), eq(notification.recipientId, recipientId)))
      .returning({ id: notification.id });
    return rows.length > 0;
  }

  // Marks every unread notification of one recipient as read; returns how many changed.
  async markAllRead(recipientId: string): Promise<number> {
    const rows = await db
      .update(notification)
      .set({ status: "READ" })
      .where(and(eq(notification.recipientId, recipientId), ne(notification.status, "READ")))
      .returning({ id: notification.id });
    return rows.length;
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

// Data access for push subscriptions.
export class PushSubscriptionRepository {
  async findByUser(userId: string) {
    return db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
  }

  // Registers a device. An endpoint is unique to one browser profile, so re-registering (or a different user
  // signing in on the same browser) moves it to the current user instead of failing or duplicating.
  async upsert(data: { userId: string; endpoint: string; p256dh: string; auth: string; userAgent: string | null }) {
    const rows = await db.insert(pushSubscription).values(data)
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: { userId: data.userId, p256dh: data.p256dh, auth: data.auth, userAgent: data.userAgent, updatedAt: new Date() },
      }).returning();
    return rows[0]!;
  }

  // Removes only the caller's own registration.
  async deleteForUser(userId: string, endpoint: string): Promise<boolean> {
    const rows = await db.delete(pushSubscription)
      .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint))).returning({ id: pushSubscription.id });
    return rows.length > 0;
  }

  // Drops an endpoint the push service reports as gone (404/410).
  async deleteByEndpoint(endpoint: string) {
    await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
  }
}
