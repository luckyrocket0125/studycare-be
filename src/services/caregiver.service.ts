import { supabase } from '../config/database';
import { createError } from '../middleware/error.middleware';
import { CaregiverChild, LinkChildDto, ChildActivity } from '../types/caregiver.types';

export class CaregiverService {
  async linkChild(caregiverId: string, data: LinkChildDto): Promise<CaregiverChild> {
    const normalizedEmail = data.childEmail.trim().toLowerCase();
    
    const { data: allStudents, error: studentsError } = await supabase
      .from('users')
      .select('id, email, full_name, role, simplified_mode')
      .eq('role', 'student');

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
      throw createError('Failed to search for child account', 500);
    }

    let child = allStudents?.find(u => u.email?.toLowerCase() === normalizedEmail);

    if (!child) {
      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
      const authUser = authUsers?.find(u => u.email?.toLowerCase() === normalizedEmail);
      
      if (authUser) {
        let userProfile = null;
        let profileError = null;

        // Try to get existing profile
        const { data: existingProfile, error: existingError } = await supabase
          .from('users')
          .select('id, email, full_name, role, simplified_mode')
          .eq('id', authUser.id)
          .single();

        if (existingError || !existingProfile) {
          // Profile doesn't exist, try to create it automatically using RPC (bypasses RLS)
          try {
            const { data: rpcData, error: rpcError } = await supabase.rpc('create_user_profile', {
              p_id: authUser.id,
              p_email: authUser.email || normalizedEmail,
              p_full_name: authUser.user_metadata?.full_name || null,
              p_role: 'student',
              p_language_preference: 'en',
              p_simplified_mode: false,
            });

            if (rpcError || !rpcData) {
              console.error('Failed to create user profile via RPC:', rpcError);
              // If RPC fails, try direct insert as fallback
              const { data: newProfile, error: insertErr } = await supabase
                .from('users')
                .insert({
                  id: authUser.id,
                  email: authUser.email || normalizedEmail,
                  full_name: authUser.user_metadata?.full_name || null,
                  role: 'student',
                  language_preference: 'en',
                  simplified_mode: false,
                })
                .select('id, email, full_name, role, simplified_mode')
                .single();

              if (insertErr || !newProfile) {
                console.error('Failed to create user profile via direct insert:', insertErr);
                throw createError('Child account exists in authentication but profile is incomplete. The student needs to complete their registration.', 404);
              }

              userProfile = newProfile;
            } else {
              userProfile = {
                id: rpcData.id,
                email: rpcData.email,
                full_name: rpcData.full_name,
                role: rpcData.role,
                simplified_mode: rpcData.simplified_mode,
              };
            }

            // Re-fetch to ensure profile is available
            if (userProfile) {
              const { data: verifyProfile, error: verifyError } = await supabase
                .from('users')
                .select('id, email, full_name, role, simplified_mode')
                .eq('id', authUser.id)
                .single();

              if (!verifyError && verifyProfile) {
                userProfile = verifyProfile;
              }
            }
          } catch (error: any) {
            console.error('Error creating user profile:', error);
            if (error.message && error.message.includes('Child account exists')) {
              throw error;
            }
            throw createError('Child account exists in authentication but profile is incomplete. The student needs to complete their registration.', 404);
          }
        } else {
          userProfile = existingProfile;
        }

        if (userProfile.role !== 'student') {
          throw createError(`Account found but is registered as ${userProfile.role}, not student.`, 400);
        }

        child = userProfile;
      } else {
        const availableEmails = allStudents?.slice(0, 5).map(u => u.email).join(', ') || 'none';
        throw createError(
          `Child account not found. Make sure the email "${data.childEmail}" is correct and the account is registered as a student.`,
          404
        );
      }
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

