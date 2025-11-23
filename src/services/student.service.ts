import { supabase } from '../config/database';
import { createError } from '../middleware/error.middleware';

export interface StudentClass {
  id: string;
  class_id: string;
  student_id: string;
  joined_at: string;
  class?: {
    id: string;
    name: string;
    class_code: string;
    subject?: string;
    teacher_id: string;
  };
}

export class StudentService {
  async joinClass(studentId: string, classCode: string): Promise<StudentClass> {
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id')
      .eq('class_code', classCode.toUpperCase())
      .single();

    if (classError || !classData) {
      throw createError('Invalid class code', 404);
    }

    const { data: existing, error: existingError } = await supabase
      .from('class_students')
      .select('id')
      .eq('class_id', classData.id)
      .eq('student_id', studentId)
      .single();

    if (existing && !existingError) {
      throw createError('Already joined this class', 400);
    }

    const { data: enrollment, error: enrollError } = await supabase
      .from('class_students')
      .insert({
        class_id: classData.id,
        student_id: studentId,
      })
      .select(`
        *,
        classes:class_id (
          id,
          name,
          class_code,
          subject,
          teacher_id
        )
      `)
      .single();

    if (enrollError || !enrollment) {
      throw createError('Failed to join class', 500);
    }

    return {
      id: enrollment.id,
      class_id: enrollment.class_id,
      student_id: enrollment.student_id,
      joined_at: enrollment.joined_at,
      class: enrollment.classes ? {
        id: enrollment.classes.id,
        name: enrollment.classes.name,
        class_code: enrollment.classes.class_code,
        subject: enrollment.classes.subject,
        teacher_id: enrollment.classes.teacher_id,
      } : undefined,
    };
  }

  async getStudentClasses(studentId: string): Promise<StudentClass[]> {
    const { data: enrollments, error } = await supabase
      .from('class_students')
      .select(`
        *,
        classes:class_id (
          id,
          name,
          class_code,
          subject,
          teacher_id
        )
      `)
      .eq('student_id', studentId);

    if (error) {
      throw createError('Failed to fetch classes', 500);
    }

    return (enrollments || []).map((e: any) => ({
      id: e.id,
      class_id: e.class_id,
      student_id: e.student_id,
      joined_at: e.joined_at,
      class: e.classes ? {
        id: e.classes.id,
        name: e.classes.name,
        class_code: e.classes.class_code,
        subject: e.classes.subject,
        teacher_id: e.classes.teacher_id,
      } : undefined,
    }));
  }
}

