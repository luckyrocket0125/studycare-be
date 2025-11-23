export interface CaregiverChild {
  id: string;
  caregiver_id: string;
  child_id: string;
  created_at: string;
  child?: {
    id: string;
    email: string;
    full_name?: string;
    simplified_mode: boolean;
  };
}

export interface LinkChildDto {
  childEmail: string;
}

export interface ChildActivity {
  child_id: string;
  child_name?: string;
  child_email: string;
  classes_count: number;
  notes_count: number;
  chat_sessions_count: number;
  last_active: string | null;
  recent_activity: {
    type: 'chat' | 'note' | 'class' | 'image';
    description: string;
    created_at: string;
  }[];
}

