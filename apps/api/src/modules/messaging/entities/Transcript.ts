export interface TranscriptData {
  id: string;
  meetingId: string;
  speaker: string;
  content: string;
  editedBy: string | null;
  editedAt: Date | null;
  createdAt: Date;
}

export class Transcript {
  constructor(private data: TranscriptData) {}

  get id() { return this.data.id; }
  get meetingId() { return this.data.meetingId; }
  get speaker() { return this.data.speaker; }
  get content() { return this.data.content; }
  get editedBy() { return this.data.editedBy; }
  get editedAt() { return this.data.editedAt; }
  get createdAt() { return this.data.createdAt; }

  // Post-hoc correction — the Oncologist editing the transcript inline during/after the
  // call (F3.7). Not append-only like Message: this is the one exception, since the whole
  // point of this feature is a human-editable transcript, not an immutable log.
  edit(content: string, editedBy: string): Transcript {
    return new Transcript({ ...this.data, content, editedBy, editedAt: new Date() });
  }

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
