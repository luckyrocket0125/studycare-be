import { supabase } from '../config/database';
import { OpenAIService } from './openai.service';
import { createError } from '../middleware/error.middleware';
import { StudyPod, PodMember, PodMessage, CreatePodDto, PodWithMembers, PodInvitation } from '../types/pod.types';

export class PodService {
  private openai: OpenAIService;

  constructor() {
    this.openai = new OpenAIService();
  }

  async createPod(userId: string, data: CreatePodDto): Promise<PodWithMembers> {
    const { data: pod, error: podError } = await supabase
      .from('study_pods')
      .insert({
        name: data.name,
        created_by: userId,
      })
      .select()
      .single();

    if (podError || !pod) {
      throw createError(
        `Failed to create pod: ${podError?.message || 'Unknown error'}`,
        500
      );
    }

    const { error: memberError } = await supabase
      .from('study_pod_members')
      .insert({
        pod_id: pod.id,
        user_id: userId,
        role: 'admin',
      });

    if (memberError) {
      throw createError('Failed to add creator as pod member', 500);
    }

    return {
      ...pod,
      memberCount: 1,
    };
  }

  async getPods(userId: string, userRole?: string): Promise<PodWithMembers[]> {
    // All users (including students) can only see pods they're members of
    const { data: memberships, error: membersError } = await supabase
      .from('study_pod_members')
      .select(`
        pod_id,
        study_pods (
          id,
          name,
          created_by,
          created_at
        )
      `)
      .eq('user_id', userId);

    if (membersError) {
      throw createError('Failed to fetch pods', 500);
    }

    const pods = (memberships || []).map((m: any) => m.study_pods).filter(Boolean);

    const podsWithCounts = await Promise.all(
      pods.map(async (pod: StudyPod) => {
        const { count } = await supabase
          .from('study_pod_members')
          .select('*', { count: 'exact', head: true })
          .eq('pod_id', pod.id);

        // Check if user is a member
        const { data: membership } = await supabase
          .from('study_pod_members')
          .select('id')
          .eq('pod_id', pod.id)
          .eq('user_id', userId)
          .single();

        // Get creator info
        const { data: creator } = await supabase
          .from('users')
          .select('id, email, full_name')
          .eq('id', pod.created_by)
          .single();

        return {
          ...pod,
          memberCount: count || 0,
          isMember: !!membership,
          creator: creator ? {
            id: creator.id,
            email: creator.email,
            full_name: creator.full_name,
          } : undefined,
        };
      })
    );

    return podsWithCounts;
  }

  async sendInvitation(podId: string, ownerId: string, invitedUserId: string): Promise<PodInvitation> {
    // Verify pod exists and user is the owner
    const { data: pod, error: podError } = await supabase
      .from('study_pods')
      .select('id, created_by')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      throw createError('Pod not found', 404);
    }

    if (pod.created_by !== ownerId) {
      throw createError('Only pod owner can send invitations', 403);
    }

    // Verify invited user is a student
    const { data: invitedUser, error: userError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', invitedUserId)
      .single();

    if (userError || !invitedUser) {
      throw createError('User not found', 404);
    }

    if (invitedUser.role !== 'student') {
      throw createError('Can only invite students', 400);
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('study_pod_members')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', invitedUserId)
      .single();

    if (existingMember) {
      throw createError('User is already a member of this pod', 400);
    }

    // Check if there's already a pending invitation
    const { data: existingInvitation } = await supabase
      .from('pod_invitations')
      .select('id')
      .eq('pod_id', podId)
      .eq('invited_user_id', invitedUserId)
      .eq('status', 'pending')
      .single();

    if (existingInvitation) {
      throw createError('Invitation already sent', 400);
    }

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('pod_invitations')
      .insert({
        pod_id: podId,
        invited_by: ownerId,
        invited_user_id: invitedUserId,
        status: 'pending',
      })
      .select()
      .single();

    if (inviteError || !invitation) {
      throw createError('Failed to send invitation', 500);
    }

    return invitation;
  }

  async getInvitations(userId: string): Promise<PodInvitation[]> {
    const { data: invitations, error: invitationsError } = await supabase
      .from('pod_invitations')
      .select(`
        *,
        study_pods:pod_id (
          id,
          name,
          created_by,
          created_at
        ),
        users:invited_by (
          id,
          email,
          full_name
        )
      `)
      .eq('invited_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (invitationsError) {
      throw createError('Failed to fetch invitations', 500);
    }

    return (invitations || []).map((inv: any) => ({
      id: inv.id,
      pod_id: inv.pod_id,
      invited_by: inv.invited_by,
      invited_user_id: inv.invited_user_id,
      status: inv.status,
      created_at: inv.created_at,
      updated_at: inv.updated_at,
      pod: inv.study_pods ? {
        id: inv.study_pods.id,
        name: inv.study_pods.name,
        created_by: inv.study_pods.created_by,
        created_at: inv.study_pods.created_at,
      } : undefined,
      inviter: inv.users ? {
        id: inv.users.id,
        email: inv.users.email,
        full_name: inv.users.full_name,
      } : undefined,
    }));
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<PodMember> {
    // Get invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('pod_invitations')
      .select('*')
      .eq('id', invitationId)
      .eq('invited_user_id', userId)
      .single();

    if (inviteError || !invitation) {
      throw createError('Invitation not found', 404);
    }

    if (invitation.status !== 'pending') {
      throw createError('Invitation is no longer pending', 400);
    }

    // Add user to pod members
    const { data: member, error: memberError } = await supabase
      .from('study_pod_members')
      .insert({
        pod_id: invitation.pod_id,
        user_id: userId,
        role: 'member',
      })
      .select()
      .single();

    if (memberError || !member) {
      throw createError('Failed to join pod', 500);
    }

    // Update invitation status
    await supabase
      .from('pod_invitations')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', invitationId);

    return member;
  }

  async declineInvitation(invitationId: string, userId: string): Promise<void> {
    const { data: invitation, error: inviteError } = await supabase
      .from('pod_invitations')
      .select('id, status')
      .eq('id', invitationId)
      .eq('invited_user_id', userId)
      .single();

    if (inviteError || !invitation) {
      throw createError('Invitation not found', 404);
    }

    if (invitation.status !== 'pending') {
      throw createError('Invitation is no longer pending', 400);
    }

    const { error: updateError } = await supabase
      .from('pod_invitations')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', invitationId);

    if (updateError) {
      throw createError('Failed to decline invitation', 500);
    }
  }

  async getSentInvitations(podId: string, ownerId: string): Promise<PodInvitation[]> {
    // Verify pod exists and user is owner
    const { data: pod, error: podError } = await supabase
      .from('study_pods')
      .select('id, created_by')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      throw createError('Pod not found', 404);
    }

    if (pod.created_by !== ownerId) {
      throw createError('Only pod owner can view sent invitations', 403);
    }

    const { data: invitations, error: invitationsError } = await supabase
      .from('pod_invitations')
      .select(`
        *,
        users:invited_user_id (
          id,
          email,
          full_name
        )
      `)
      .eq('pod_id', podId)
      .order('created_at', { ascending: false });

    if (invitationsError) {
      throw createError('Failed to fetch invitations', 500);
    }

    return (invitations || []).map((inv: any) => ({
      id: inv.id,
      pod_id: inv.pod_id,
      invited_by: inv.invited_by,
      invited_user_id: inv.invited_user_id,
      status: inv.status,
      created_at: inv.created_at,
      updated_at: inv.updated_at,
      invited_user: inv.users ? {
        id: inv.users.id,
        email: inv.users.email,
        full_name: inv.users.full_name,
      } : undefined,
    }));
  }

  async getClassmates(userId: string, podId?: string): Promise<Array<{ id: string; email: string; full_name?: string }>> {
    // Get all classes the user is enrolled in
    const { data: userClasses, error: classesError } = await supabase
      .from('class_students')
      .select('class_id')
      .eq('student_id', userId);

    if (classesError || !userClasses || userClasses.length === 0) {
      return [];
    }

    const classIds = userClasses.map(c => c.class_id);

    // Get all students in the same classes (excluding the current user)
    const { data: classmates, error: classmatesError } = await supabase
      .from('class_students')
      .select('student_id')
      .in('class_id', classIds)
      .neq('student_id', userId);

    if (classmatesError || !classmates || classmates.length === 0) {
      return [];
    }

    // Get unique student IDs (a student might be in multiple shared classes)
    let classmateIds = [...new Set(classmates.map(c => c.student_id))];

    // If podId is provided, exclude students who are already members or have pending invitations
    if (podId) {
      // Get existing members
      const { data: members, error: membersError } = await supabase
        .from('study_pod_members')
        .select('user_id')
        .eq('pod_id', podId);

      if (!membersError && members) {
        const memberIds = new Set(members.map(m => m.user_id));
        classmateIds = classmateIds.filter(id => !memberIds.has(id));
      }

      // Get pending invitations
      const { data: pendingInvitations, error: invitationsError } = await supabase
        .from('pod_invitations')
        .select('invited_user_id')
        .eq('pod_id', podId)
        .eq('status', 'pending');

      if (!invitationsError && pendingInvitations) {
        const invitedIds = new Set(pendingInvitations.map(inv => inv.invited_user_id));
        classmateIds = classmateIds.filter(id => !invitedIds.has(id));
      }
    }

    if (classmateIds.length === 0) {
      return [];
    }

    // Get user info for all classmates
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name')
      .in('id', classmateIds)
      .eq('role', 'student')
      .neq('id', userId); // Double-check to exclude current user

    if (usersError) {
      throw createError('Failed to fetch classmates', 500);
    }

    // Sort by full_name or email for better UX
    const sortedUsers = (users || []).sort((a: any, b: any) => {
      const nameA = a.full_name || a.email || '';
      const nameB = b.full_name || b.email || '';
      return nameA.localeCompare(nameB);
    });

    return sortedUsers.map((u: any) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
    }));
  }

  async getPod(podId: string, userId: string, userRole?: string): Promise<PodWithMembers> {
    // Check if pod exists and user has access (creator or member)
    const { data: pod, error: podError } = await supabase
      .from('study_pods')
      .select('id, name, created_by, created_at')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      throw createError('Pod not found', 404);
    }

    // Check if user is creator or member
    const isCreator = pod.created_by === userId;
    
    const { data: membership } = await supabase
      .from('study_pod_members')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', userId)
      .single();

    if (!isCreator && !membership) {
      throw createError('Access denied. You must be a member to view this pod.', 403);
    }

    // Get member count
    const { count } = await supabase
      .from('study_pod_members')
      .select('*', { count: 'exact', head: true })
      .eq('pod_id', podId);

    // Only fetch members list if user is a member (for privacy)
    let members: any[] = [];
    if (membership) {
      const { data: membersData, error: membersError } = await supabase
        .from('study_pod_members')
        .select(`
          *,
          users:user_id (
            id,
            email,
            full_name
          )
        `)
        .eq('pod_id', podId);

      if (!membersError && membersData) {
        members = membersData;
      }
    }

    // Get creator info
    const { data: creator } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('id', pod.created_by)
      .single();

    return {
      ...pod,
      members: members.map((m: any) => ({
        id: m.id,
        pod_id: m.pod_id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        user: m.users ? {
          id: m.users.id,
          email: m.users.email,
          full_name: m.users.full_name,
        } : undefined,
      })),
      memberCount: count || 0,
      isMember: !!membership,
      creator: creator ? {
        id: creator.id,
        email: creator.email,
        full_name: creator.full_name,
      } : undefined,
    };
  }

  async joinPod(podId: string, userId: string): Promise<PodMember> {
    const { data: pod, error: podError } = await supabase
      .from('study_pods')
      .select('id')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      throw createError('Pod not found', 404);
    }

    const { data: existing, error: existingError } = await supabase
      .from('study_pod_members')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', userId)
      .single();

    if (existing && !existingError) {
      throw createError('Already a member of this pod', 400);
    }

    const { data: member, error: memberError } = await supabase
      .from('study_pod_members')
      .insert({
        pod_id: podId,
        user_id: userId,
        role: 'member',
      })
      .select()
      .single();

    if (memberError || !member) {
      throw createError('Failed to join pod', 500);
    }

    return member;
  }

  async leavePod(podId: string, userId: string): Promise<void> {
    const { data: member, error: memberError } = await supabase
      .from('study_pod_members')
      .select('role')
      .eq('pod_id', podId)
      .eq('user_id', userId)
      .single();

    if (memberError || !member) {
      throw createError('Not a member of this pod', 404);
    }

    if (member.role === 'admin') {
      const { count } = await supabase
        .from('study_pod_members')
        .select('*', { count: 'exact', head: true })
        .eq('pod_id', podId)
        .eq('role', 'admin');

      if ((count || 0) === 1) {
        throw createError('Cannot leave pod as the only admin. Transfer admin role first or delete the pod.', 400);
      }
    }

    const { error: deleteError } = await supabase
      .from('study_pod_members')
      .delete()
      .eq('pod_id', podId)
      .eq('user_id', userId);

    if (deleteError) {
      throw createError('Failed to leave pod', 500);
    }
  }

  async sendMessage(podId: string, userId: string, content: string, userRole?: string): Promise<PodMessage> {
    // Check if user is a member - all users must be members to send messages
    const { data: membership, error: membershipError } = await supabase
      .from('study_pod_members')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      throw createError('Not a member of this pod', 403);
    }

    const { data: message, error: messageError } = await supabase
      .from('pod_messages')
      .insert({
        pod_id: podId,
        user_id: userId,
        content,
      })
      .select(`
        *,
        users:user_id (
          id,
          email,
          full_name
        )
      `)
      .single();

    if (messageError || !message) {
      throw createError('Failed to send message', 500);
    }

    const userMessage = {
      ...message,
      user: message.users ? {
        id: message.users.id,
        email: message.users.email,
        full_name: message.users.full_name,
      } : undefined,
    };

    // Check if message contains "@StudyCare help" command - trigger AI asynchronously
    const needsAIHelp = content.toLowerCase().includes('@studycare help') || content.toLowerCase().includes('@studycare');
    
    if (needsAIHelp) {
      // Trigger AI response asynchronously (don't wait for it)
      this.getAIHelp(podId, userId).catch((error) => {
        console.error('Failed to get AI help:', error);
      });
    }

    return userMessage;
  }

  async getAIHelp(podId: string, userId: string): Promise<PodMessage> {
    // Check if user is a member
    const { data: membership, error: membershipError } = await supabase
      .from('study_pod_members')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      throw createError('Not a member of this pod', 403);
    }

    // Get recent conversation context
    const recentMessages = await this.getMessages(podId, 20, userId);
    const conversationContext = recentMessages
      .slice(-10)
      .filter(msg => !msg.ai_guidance) // Exclude previous AI responses
      .map((msg) => `${msg.user?.full_name || 'User'}: ${msg.content}`)
      .join('\n');

    const aiPrompt = `You are StudyCare AI, an AI study guide helping a study group. The group has been discussing:

${conversationContext}

Provide helpful guidance, clarification, or study tips related to their discussion. Keep it concise (2-3 sentences) and educational. Be friendly and supportive.`;

    try {
      const aiGuidance = await this.openai.chatCompletion(
        [{ role: 'user', content: aiPrompt }],
        { stepByStep: false }
      );

      // Create AI response as a separate message
      const { data: aiMessage, error: aiMessageError } = await supabase
        .from('pod_messages')
        .insert({
          pod_id: podId,
          user_id: userId,
          content: aiGuidance,
          ai_guidance: aiGuidance,
        })
        .select(`
          *,
          users:user_id (
            id,
            email,
            full_name
          )
        `)
        .single();

      if (aiMessageError || !aiMessage) {
        throw createError('Failed to create AI response', 500);
      }

      return {
        ...aiMessage,
        user: {
          id: 'ai',
          email: 'studycare@ai',
          full_name: 'StudyCare AI',
        },
      };
    } catch (error) {
      throw createError('Failed to get AI help', 500);
    }
  }

  async getMessages(podId: string, limit: number = 50, userId?: string, userRole?: string): Promise<PodMessage[]> {
    // All users (including students) must be members to view messages
    if (userId) {
      const { data: membership, error: membershipError } = await supabase
        .from('study_pod_members')
        .select('id')
        .eq('pod_id', podId)
        .eq('user_id', userId)
        .single();

      if (membershipError || !membership) {
        throw createError('Not a member of this pod', 403);
      }
    }
    const { data: messages, error } = await supabase
      .from('pod_messages')
      .select(`
        *,
        users:user_id (
          id,
          email,
          full_name
        )
      `)
      .eq('pod_id', podId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw createError('Failed to fetch messages', 500);
    }

    return (messages || []).map((m: any) => {
      // Check if this is an AI message (has ai_guidance and content matches)
      const isAIMessage = m.ai_guidance && m.content === m.ai_guidance;
      
      return {
        id: m.id,
        pod_id: m.pod_id,
        user_id: m.user_id,
        content: m.content,
        ai_guidance: m.ai_guidance,
        created_at: m.created_at,
        user: isAIMessage ? {
          id: 'ai',
          email: 'studycare@ai',
          full_name: 'StudyCare AI',
        } : (m.users ? {
          id: m.users.id,
          email: m.users.email,
          full_name: m.users.full_name,
        } : undefined),
      };
    });
  }

  async deletePod(podId: string, userId: string): Promise<void> {
    const { data: pod, error: podError } = await supabase
      .from('study_pods')
      .select('created_by')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      throw createError('Pod not found', 404);
    }

    if (pod.created_by !== userId) {
      const { data: member, error: memberError } = await supabase
        .from('study_pod_members')
        .select('role')
        .eq('pod_id', podId)
        .eq('user_id', userId)
        .eq('role', 'admin')
        .single();

      if (memberError || !member) {
        throw createError('Only pod creator or admins can delete pods', 403);
      }
    }

    const { error: deleteError } = await supabase
      .from('study_pods')
      .delete()
      .eq('id', podId);

    if (deleteError) {
      throw createError('Failed to delete pod', 500);
    }
  }
}

