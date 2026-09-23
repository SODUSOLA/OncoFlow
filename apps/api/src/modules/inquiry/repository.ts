import { db } from "../../db/index.js";
import { eq, asc, desc } from "drizzle-orm";
import { publicInquiry, publicInquiryMessage } from "./schema.js";

// Data access for public inquiries.
export class PublicInquiryRepository {
  // Finds an inquiry by id.
  async findById(id: string) {
    const row = await db.select().from(publicInquiry).where(eq(publicInquiry.id, id)).limit(1);
    return row[0] ?? null;
  }

  // Lists inquiries, most recently updated first.
  async findAll() {
    return db.select().from(publicInquiry).orderBy(desc(publicInquiry.updatedAt));
  }

  // Inserts an inquiry.
  async create(data: typeof publicInquiry.$inferInsert) {
    const row = await db.insert(publicInquiry).values(data).returning();
    return row[0]!;
  }

  // Updates an inquiry.
  async update(id: string, data: Partial<typeof publicInquiry.$inferInsert>) {
    const row = await db
      .update(publicInquiry)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(publicInquiry.id, id))
      .returning();
    return row[0] ?? null;
  }
}

// Data access for inquiry messages.
export class PublicInquiryMessageRepository {
  // Lists an inquiry's messages.
  async findByInquiry(inquiryId: string) {
    return db
      .select()
      .from(publicInquiryMessage)
      .where(eq(publicInquiryMessage.inquiryId, inquiryId))
      .orderBy(asc(publicInquiryMessage.createdAt));
  }

  // Inserts an inquiry message.
  async create(data: typeof publicInquiryMessage.$inferInsert) {
    const row = await db.insert(publicInquiryMessage).values(data).returning();
    return row[0]!;
  }
}
