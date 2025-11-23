export type UserRole = 'student' | 'teacher' | 'caregiver';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole;
  language_preference: string;
  simplified_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserDto {
  email: string;
  password: string;
  full_name?: string;
  role: UserRole;
  language_preference?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

