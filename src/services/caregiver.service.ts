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
            // Ensure we have a valid email
            const userEmail = authUser.email || normalizedEmail;
            if (!userEmail) {
              throw createError('User email is required but not found in authentication', 400);
            }

            const { data: rpcData, error: rpcError } = await supabase.rpc('create_user_profile', {
              p_id: authUser.id,
              p_email: userEmail,
              p_full_name: authUser.user_metadata?.full_name || null,
              p_role: 'student',
              p_language_preference: 'en',
              p_simplified_mode: false,
            });

            if (rpcError) {
              console.error('RPC Error details:', {
                message: rpcError.message,
                details: rpcError.details,
                hint: rpcError.hint,
                code: rpcError.code,
              });

              // Check if it's a duplicate key error (profile was created between check and insert)
              if (rpcError.code === '23505' || rpcError.message?.includes('duplicate') || rpcError.message?.includes('already exists')) {
                // Profile might have been created, try to fetch it again
                const { data: retryProfile, error: retryError } = await supabase
                  .from('users')
                  .select('id, email, full_name, role, simplified_mode')
                  .eq('id', authUser.id)
                  .single();

                if (!retryError && retryProfile) {
                  userProfile = retryProfile;
                } else {
                  throw createError('Child account exists in authentication but profile is incomplete. The student needs to complete their registration.', 404);
                }
              } else {
                // If RPC fails with other error, try direct insert as fallback
                const { data: newProfile, error: insertErr } = await supabase
                  .from('users')
                  .insert({
                    id: authUser.id,
                    email: userEmail,
                    full_name: authUser.user_metadata?.full_name || null,
                    role: 'student',
                    language_preference: 'en',
                    simplified_mode: false,
                  })
                  .select('id, email, full_name, role, simplified_mode')
                  .single();

                if (insertErr) {
                  console.error('Direct Insert Error details:', {
                    message: insertErr.message,
                    details: insertErr.details,
                    hint: insertErr.hint,
                    code: insertErr.code,
                  });

                  // Check if it's a duplicate key error
                  if (insertErr.code === '23505' || insertErr.message?.includes('duplicate') || insertErr.message?.includes('already exists')) {
                    // Profile was created, fetch it
                    const { data: fetchProfile, error: fetchError } = await supabase
                      .from('users')
                      .select('id, email, full_name, role, simplified_mode')
                      .eq('id', authUser.id)
                      .single();

                    if (!fetchError && fetchProfile) {
                      userProfile = fetchProfile;
                    } else {
                      throw createError('Child account exists in authentication but profile is incomplete. The student needs to complete their registration.', 404);
                    }
                  } else {
                    throw createError(`Failed to create user profile: ${insertErr.message || 'Unknown error'}`, 500);
                  }
                } else if (newProfile) {
                  userProfile = newProfile;
                } else {
                  throw createError('Child account exists in authentication but profile is incomplete. The student needs to complete their registration.', 404);
                }
              }
            } else if (rpcData) {
              userProfile = {
                id: rpcData.id,
                email: rpcData.email,
                full_name: rpcData.full_name,
                role: rpcData.role,
                simplified_mode: rpcData.simplified_mode,
              };
            } else {
              throw createError('Child account exists in authentication but profile is incomplete. The student needs to complete their registration.', 404);
            }

            // Final verification - re-fetch to ensure profile is available
            if (userProfile) {
              const { data: verifyProfile, error: verifyError } = await supabase
                .from('users')
                .select('id, email, full_name, role, simplified_mode')
                .eq('id', authUser.id)
                .single();

              if (!verifyError && verifyProfile) {
                userProfile = verifyProfile;
              } else if (verifyError) {
                console.error('Verification failed after profile creation:', verifyError);
                throw createError('Profile was created but could not be verified. Please try again.', 500);
              }
            }
          } catch (error: any) {
            console.error('Error creating user profile:', error);
            // If it's already our custom error, re-throw it
            if (error.statusCode || (error.message && error.message.includes('Child account exists'))) {
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
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_caregiver_children', {
        p_caregiver_id: caregiverId,
      });

      if (rpcError) {
        console.error('RPC Error fetching caregiver children:', rpcError);
        throw createError('Failed to fetch linked children', 500);
      }

      if (!rpcData || rpcData.length === 0) {
        return [];
      }

      return rpcData.map((row: any) => ({
        id: row.relationship_id,
        caregiver_id: row.caregiver_id,
        child_id: row.child_id,
        created_at: row.created_at,
        child: {
          id: row.child_id,
          email: row.child_email,
          full_name: row.child_full_name,
          simplified_mode: row.child_simplified_mode || false,
        },
      }));
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      console.error('Error in getLinkedChildren:', error);
      throw createError('Failed to fetch linked children', 500);
    }
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
      .select('id')
      .eq('caregiver_id', caregiverId)
      .eq('child_id', childId)
      .single();

    if (relationshipError || !relationship) {
      throw createError('Child not linked to this caregiver', 403);
    }

    const { data: childData, error: childError } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('id', childId)
      .eq('role', 'student')
      .single();

    let child: { id: string; email: string; full_name?: string | null } | null = null;

    if (childError || !childData) {
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
    } else {
      child = {
        id: childData.id,
        email: childData.email,
        full_name: childData.full_name,
      };
    }

    if (!child) {
      throw createError('Child not found', 404);
    }

    try {
      const { data: activityData, error: activityError } = await supabase.rpc('get_child_activity', {
        p_caregiver_id: caregiverId,
        p_child_id: childId,
      });

      if (activityError) {
        console.error('RPC Error fetching child activity:', {
          error: activityError,
          message: activityError.message,
          details: activityError.details,
          hint: activityError.hint,
          code: activityError.code,
          caregiverId,
          childId,
        });
        
        if (activityError.code === '42883' || activityError.message?.includes('does not exist')) {
          throw createError(
            'Child activity function not found. Please run database migrations.',
            500
          );
        }
        
        throw createError(
          `Failed to fetch child activity: ${activityError.message || 'Unknown error'}`,
          500
        );
      }

      if (!activityData || activityData.length === 0) {
        console.warn('Child activity data is empty, returning default values:', { caregiverId, childId });
        return {
          child_id: child.id,
          child_name: child.full_name || undefined,
          child_email: child.email,
          classes_count: 0,
          notes_count: 0,
          chat_sessions_count: 0,
          last_active: null,
          recent_activity: [],
        };
      }

      const activity = activityData[0];

      const { data: recentActivityData, error: recentError } = await supabase.rpc('get_recent_child_activity', {
        p_caregiver_id: caregiverId,
        p_child_id: childId,
        p_limit: 10,
      });

      if (recentError) {
        console.error('RPC Error fetching recent activity:', recentError);
      }

      const recentActivity: ChildActivity['recent_activity'] = (recentActivityData || []).map((item: any) => ({
        type: item.activity_type as 'chat' | 'note' | 'image',
        description: item.description,
        created_at: item.created_at,
      }));

      recentActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      recentActivity.splice(10);

      return {
        child_id: activity.child_id,
        child_name: activity.child_full_name || undefined,
        child_email: activity.child_email,
        classes_count: Number(activity.classes_count) || 0,
        notes_count: Number(activity.notes_count) || 0,
        chat_sessions_count: Number(activity.chat_sessions_count) || 0,
        last_active: activity.last_active || null,
        recent_activity: recentActivity,
      };
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      console.error('Error in getChildActivity:', error);
      throw createError('Failed to fetch child activity', 500);
    }
  }
}

