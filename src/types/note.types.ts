export interface Note {
  id: string;
  user_id: string;
  class_id?: string | null;
  title: string;
  content: string;
  ai_summary?: string;
  ai_explanation?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  class?: {
    id: string;
    name: string;
    class_code: string;
    subject?: string;
  };
}

export interface CreateNoteDto {
  title: string;
  content: string;
  tags?: string[];
  class_id?: string | null;
}

export interface UpdateNoteDto {
  title?: string;
  content?: string;
  tags?: string[];
  class_id?: string | null;
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

