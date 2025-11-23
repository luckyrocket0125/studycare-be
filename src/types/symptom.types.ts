export interface SymptomCheck {
  id: string;
  user_id: string;
  session_id: string;
  symptoms: string;
  guidance: string;
  severity_level?: 'mild' | 'moderate' | 'severe' | 'emergency';
  created_at: string;
}

export interface SymptomCheckDto {
  symptoms: string;
  additionalInfo?: string;
}

export interface SymptomGuidance {
  guidance: string;
  educationalInfo: string;
  whenToSeekHelp: string;
  severityLevel: 'mild' | 'moderate' | 'severe' | 'emergency';
  disclaimer: string;
}

