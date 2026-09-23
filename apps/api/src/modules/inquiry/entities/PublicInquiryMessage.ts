import type { publicInquiryMessageSenderTypeEnum } from "../../../db/enums.js";

type SenderType = (typeof publicInquiryMessageSenderTypeEnum.enumValues)[number];

export interface PublicInquiryMessageData {
  id: string;
  inquiryId: string;
  senderType: SenderType;
  senderUserId: string | null;
  content: string;
  createdAt: Date;
}

// Domain entity for one message in an inquiry thread.
export class PublicInquiryMessage {
  constructor(private data: PublicInquiryMessageData) {}

  // Serializes the message for API responses.
  toJSON() {
    return {
      id: this.data.id,
      inquiryId: this.data.inquiryId,
      senderType: this.data.senderType,
      senderUserId: this.data.senderUserId,
      content: this.data.content,
      createdAt: this.data.createdAt.toISOString(),
    };
  }
}
