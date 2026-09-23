import type { messageTypeEnum, messageStatusEnum } from "../../../db/enums.js";

type MessageType = (typeof messageTypeEnum.enumValues)[number];
type MessageStatus = (typeof messageStatusEnum.enumValues)[number];

export interface MessageData {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  status: MessageStatus;
  createdAt: Date;
}

// Domain entity for one conversation message.
export class Message {
  constructor(private data: MessageData) {}

  get id() { return this.data.id; }
  get conversationId() { return this.data.conversationId; }
  get senderId() { return this.data.senderId; }
  get type() { return this.data.type; }
  get content() { return this.data.content; }
  get status() { return this.data.status; }
  get createdAt() { return this.data.createdAt; }

  get countsAsFirstResponse(): boolean {
    return this.data.type !== "SYSTEM";
  }

  // Serializes the message for API responses.
  toJSON() {
    return {
      id: this.data.id,
      conversationId: this.data.conversationId,
      senderId: this.data.senderId,
      type: this.data.type,
      content: this.data.content,
      status: this.data.status,
      createdAt: this.data.createdAt.toISOString(),
    };
  }
}
