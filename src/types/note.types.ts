export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  ai_summary?: string;
  ai_explanation?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateNoteDto {
  title: string;
  content: string;
  tags?: string[];
}

export interface UpdateNoteDto {
  title?: string;
  content?: string;
  tags?: string[];
}

export interface NoteSummary {
  summary: string;
  keyPoints: string[];
  suggestedTags: string[];
}

export interface NoteExplanation {
  explanation: string;
  concepts: string[];
}

