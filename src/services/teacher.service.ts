import { supabase } from '../config/database';
import { createError } from '../middleware/error.middleware';

export interface Class {
  id: string;
  teacher_id: string;
  name: string;
  class_code: string;
  subject?: string;
  created_at: string;
  updated_at: string;
}

export interface ClassStudent {
  id: string;
  class_id: string;
  student_id: string;
  joined_at: string;
  user?: {
    id: string;
    full_name?: string;
    email: string;
  };
}

export interface StudentActivity {
  student_id: string;
  student_name?: string;
  student_email?: string;
  last_active: string | null;
  questions_asked: number;
  images_submitted: number;
  notes_created: number;
}

export class TeacherService {
  async createClass(teacherId: string, className: string, subject?: string): Promise<Class> {
    const classCode = this.generateClassCode();

    const { data: classData, error } = await supabase
      .from('classes')
      .insert({
        teacher_id: teacherId,
        name: className,
        class_code: classCode,
        subject: subject || null,
      })
      .select()
      .single();

    if (error || !classData) {
      throw createError('Failed to create class', 500);
    }

    return classData;
  }

  async getClasses(teacherId: string): Promise<Class[]> {
    const { data: classes, error } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (error) {
      throw createError('Failed to fetch classes', 500);
    }

    return classes || [];
  }

  async getClassStudents(classId: string, teacherId: string): Promise<ClassStudent[]> {
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('teacher_id')
      .eq('id', classId)
      .single();

    if (classError || !classData || classData.teacher_id !== teacherId) {
      throw createError('Class not found or access denied', 404);
    }

    const { data: classStudents, error: studentsError } = await supabase
      .from('class_students')
      .select('id, class_id, student_id, joined_at')
      .eq('class_id', classId);

    if (studentsError) {
      throw createError('Failed to fetch students', 500);
    }

    if (!classStudents || classStudents.length === 0) {
      return [];
    }

    const { data: studentsInfo, error: infoError } = await supabase.rpc('get_class_students_info', {
      p_teacher_id: teacherId,
      p_class_id: classId,
    });

    if (infoError) {
      const userMap = new Map<string, { name?: string; email: string }>();
      return (classStudents || []).map((cs) => ({
        id: cs.id,
        class_id: cs.class_id,
        student_id: cs.student_id,
        joined_at: cs.joined_at,
        user: undefined,
      }));
    }

    const userMap = new Map<string, { name?: string; email: string }>(
      (studentsInfo || []).map((s: any) => [s.student_id, { name: s.full_name, email: s.email }])
    );

    return (classStudents || []).map((cs) => {
      const userInfo = userMap.get(cs.student_id);
      return {
        id: cs.id,
        class_id: cs.class_id,
        student_id: cs.student_id,
        joined_at: cs.joined_at,
        user: userInfo ? {
          id: cs.student_id,
          full_name: userInfo.name || undefined,
          email: userInfo.email,
        } : undefined,
      };
    });
  }

  async getClassActivityStats(classId: string, teacherId: string): Promise<StudentActivity[]> {
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('teacher_id')
      .eq('id', classId)
      .single();

    if (classError || !classData || classData.teacher_id !== teacherId) {
      throw createError('Class not found or access denied', 404);
    }

    const { data: studentsInfo, error: studentsInfoError } = await supabase.rpc('get_class_students_info', {
      p_teacher_id: teacherId,
      p_class_id: classId,
    });

    if (studentsInfoError) {
      throw createError('Failed to fetch class students', 500);
    }

    if (!studentsInfo || studentsInfo.length === 0) {
      return [];
    }

    const stats = await Promise.all(
      studentsInfo.map(async (student: any) => {
        const { data: activityData, error: activityError } = await supabase.rpc('get_student_activity_stats', {
          p_teacher_id: teacherId,
          p_student_id: student.student_id,
        });

        if (activityError) {
          return {
            student_id: student.student_id,
            student_name: student.full_name || null,
            student_email: student.email || null,
            last_active: null,
            questions_asked: 0,
            images_submitted: 0,
            notes_created: 0,
          };
        }

        const activity = activityData && activityData.length > 0 ? activityData[0] : null;

        return {
          student_id: student.student_id,
          student_name: student.full_name || null,
          student_email: student.email || null,
          last_active: activity?.last_active || null,
          questions_asked: activity?.questions_asked || 0,
          images_submitted: activity?.images_submitted || 0,
          notes_created: activity?.notes_created || 0,
        };
      })
    );

    return stats;
  }


  private generateClassCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}

