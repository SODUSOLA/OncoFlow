export interface TranscriptData {
  id: string;
  meetingId: string;
  speaker: string;
  content: string;
  editedBy: string | null;
  editedAt: Date | null;
  createdAt: Date;
}

// Domain entity for a transcript segment.
export class Transcript {
  constructor(private data: TranscriptData) {}

  get id() { return this.data.id; }
  get meetingId() { return this.data.meetingId; }
  get speaker() { return this.data.speaker; }
  get content() { return this.data.content; }
  get editedBy() { return this.data.editedBy; }
  get editedAt() { return this.data.editedAt; }
  get createdAt() { return this.data.createdAt; }

  // The one editable exception to append-only messaging: the oncologist corrects the transcript inline (F3.7).
  edit(content: string, editedBy: string): Transcript {
    return new Transcript({ ...this.data, content, editedBy, editedAt: new Date() });
  }

  // Serializes the transcript segment for API responses.
  toJSON() {
    return {
      id: this.data.id,
      meetingId: this.data.meetingId,
      speaker: this.data.speaker,
      content: this.data.content,
      editedBy: this.data.editedBy,
      editedAt: this.data.editedAt?.toISOString() ?? null,
      createdAt: this.data.createdAt.toISOString(),
    };
  }
}
