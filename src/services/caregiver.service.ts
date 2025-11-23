import { supabase } from '../config/database';
import { createError } from '../middleware/error.middleware';
import { CaregiverChild, LinkChildDto, ChildActivity } from '../types/caregiver.types';

export class CaregiverService {
  async linkChild(caregiverId: string, data: LinkChildDto): Promise<CaregiverChild> {
    const { data: child, error: childError } = await supabase
      .from('users')
      .select('id, email, full_name, role, simplified_mode')
      .eq('email', data.childEmail)
      .eq('role', 'student')
      .single();

    if (childError || !child) {
      throw createError('Child account not found. Make sure the email is correct and the account is a student.', 404);
    }

    const { data: existing, error: existingError } = await supabase
      .from('caregiver_children')
      .select('id')
      .eq('caregiver_id', caregiverId)
      .eq('child_id', child.id)
      .single();

    if (existing && !existingError) {
      throw createError('Child is already linked to this caregiver', 400);
    }

    let relationship: any = null;
    let relationshipError: any = null;

    try {
      const { data: relationshipData, error: insertError } = await supabase
        .from('caregiver_children')
        .insert({
          caregiver_id: caregiverId,
          child_id: child.id,
        })
        .select()
        .single();

      relationship = relationshipData;
      relationshipError = insertError;
    } catch (error) {
      relationshipError = error;
    }

    if (relationshipError || !relationship) {
      try {
        const { data: relationshipData, error: rpcError } = await supabase.rpc('link_caregiver_child', {
          p_caregiver_id: caregiverId,
          p_child_id: child.id,
        });

        if (rpcError || !relationshipData) {
          throw rpcError || new Error('RPC call failed');
        }

        relationship = relationshipData;
        relationshipError = null;
      } catch (rpcError) {
        console.error('Failed to link child (both methods failed):', relationshipError, rpcError);
        throw createError('Failed to link child', 500);
      }
    }

    return {
      ...relationship,
      child: {
        id: child.id,
        email: child.email,
        full_name: child.full_name,
        simplified_mode: child.simplified_mode,
      },
    };
  }

  async getLinkedChildren(caregiverId: string): Promise<CaregiverChild[]> {
    const { data: relationships, error } = await supabase
      .from('caregiver_children')
      .select(`
        *,
        child:child_id (
          id,
          email,
          full_name,
          simplified_mode
        )
      `)
      .eq('caregiver_id', caregiverId)
      .order('created_at', { ascending: false });

    if (error) {
      throw createError('Failed to fetch linked children', 500);
    }

    return (relationships || []).map((rel: any) => ({
      id: rel.id,
      caregiver_id: rel.caregiver_id,
      child_id: rel.child_id,
      created_at: rel.created_at,
      child: rel.child ? {
        id: rel.child.id,
        email: rel.child.email,
        full_name: rel.child.full_name,
        simplified_mode: rel.child.simplified_mode,
      } : undefined,
    }));
  }

  async unlinkChild(caregiverId: string, childId: string): Promise<void> {
    const { error } = await supabase
      .from('caregiver_children')
      .delete()
      .eq('caregiver_id', caregiverId)
      .eq('child_id', childId);

    if (error) {
      throw createError('Failed to unlink child', 500);
    }
  }

  async getChildActivity(caregiverId: string, childId: string): Promise<ChildActivity> {
    const { data: relationship, error: relationshipError } = await supabase
      .from('caregiver_children')
      .select(`
        id,
        child:child_id (
          id,
          email,
          full_name
        )
      `)
      .eq('caregiver_id', caregiverId)
      .eq('child_id', childId)
      .single();

    if (relationshipError || !relationship) {
      throw createError('Child not linked to this caregiver', 403);
    }

    const relationshipData = relationship as any;
    let child = relationshipData.child;

    if (!child) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_child_info', {
        p_caregiver_id: caregiverId,
        p_child_id: childId,
      });

      if (rpcError || !rpcData || rpcData.length === 0) {
        throw createError('Child not found', 404);
      }

      child = {
        id: rpcData[0].id,
        email: rpcData[0].email,
        full_name: rpcData[0].full_name,
      };
    }

    const [classesCount, notesCount, sessionsCount, lastActive] = await Promise.all([
      supabase
        .from('class_students')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', childId),
      supabase
        .from('notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', childId),
      supabase
        .from('study_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', childId),
      supabase
        .from('study_sessions')
        .select('created_at')
        .eq('user_id', childId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const recentNotes = await supabase
      .from('notes')
      .select('id, title, created_at')
      .eq('user_id', childId)
      .order('created_at', { ascending: false })
      .limit(5);

    const recentSessions = await supabase
      .from('study_sessions')
      .select('id, session_type, subject, created_at')
      .eq('user_id', childId)
      .order('created_at', { ascending: false })
      .limit(5);

    const recentActivity: ChildActivity['recent_activity'] = [];

    if (recentNotes.data) {
      recentNotes.data.forEach((note) => {
        recentActivity.push({
          type: 'note',
          description: `Created note: ${note.title}`,
          created_at: note.created_at,
        });
      });
    }

    if (recentSessions.data) {
      recentSessions.data.forEach((session) => {
        recentActivity.push({
          type: session.session_type as 'chat' | 'image',
          description: `${session.session_type} session${session.subject ? ` - ${session.subject}` : ''}`,
          created_at: session.created_at,
        });
      });
    }

    recentActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    recentActivity.splice(10);

    return {
      child_id: child.id,
      child_name: child.full_name,
      child_email: child.email,
      classes_count: classesCount.count || 0,
      notes_count: notesCount.count || 0,
      chat_sessions_count: sessionsCount.count || 0,
      last_active: lastActive.data?.created_at || null,
      recent_activity: recentActivity,
    };
  }
}

