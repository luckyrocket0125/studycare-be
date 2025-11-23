export interface StudyPod {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface PodMember {
  id: string;
  pod_id: string;
  user_id: string;
  role: 'member' | 'admin';
  joined_at: string;
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

export interface PodMessage {
  id: string;
  pod_id: string;
  user_id: string;
  content: string;
  ai_guidance?: string;
  created_at: string;
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

export interface CreatePodDto {
  name: string;
}

export interface PodWithMembers extends StudyPod {
  members?: PodMember[];
  memberCount?: number;
}

