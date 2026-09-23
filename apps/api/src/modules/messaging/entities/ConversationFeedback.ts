import type { conversationFeedbackRaterRoleEnum } from "../../../db/enums.js";

type RaterRole = (typeof conversationFeedbackRaterRoleEnum.enumValues)[number];

export interface ConversationFeedbackData {
  id: string;
  conversationId: string;
  raterId: string;
  raterRole: RaterRole;
  rating: number;
  review: string | null;
  createdAt: Date;
}

// Domain entity for one rater's feedback on a conversation.
export class ConversationFeedback {
  constructor(private data: ConversationFeedbackData) {}

  // Serializes the feedback for API responses.
  toJSON() {
    return {
      id: this.data.id,
      conversationId: this.data.conversationId,
      raterId: this.data.raterId,
      raterRole: this.data.raterRole,
      rating: this.data.rating,
      review: this.data.review,
      createdAt: this.data.createdAt.toISOString(),
    };
  }
}
