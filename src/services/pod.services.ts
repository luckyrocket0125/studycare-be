import { supabase } from '../config/database';
import { OpenAIService } from './openai.service';
import { createError } from '../middleware/error.middleware';
import { StudyPod, PodMember, PodMessage, CreatePodDto, PodWithMembers } from '../types/pod.types';

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
    let pods: StudyPod[] = [];

    if (userRole === 'student') {
      // For students, return all pods
      const { data: allPods, error: podsError } = await supabase
        .from('study_pods')
        .select('id, name, created_by, created_at')
        .order('created_at', { ascending: false });

      if (podsError) {
        throw createError('Failed to fetch pods', 500);
      }

      pods = allPods || [];
    } else {
      // For other roles, return only pods they're members of
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

      pods = (memberships || []).map((m: any) => m.study_pods).filter(Boolean);
    }

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

  async getPod(podId: string, userId: string, userRole?: string): Promise<PodWithMembers> {
    // Check if pod exists
    const { data: pod, error: podError } = await supabase
      .from('study_pods')
      .select('id, name, created_by, created_at')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      throw createError('Pod not found', 404);
    }

    // For students, allow access to any pod. For other roles, check membership
    if (userRole !== 'student') {
      const { data: membership, error: membershipError } = await supabase
        .from('study_pod_members')
        .select('id')
        .eq('pod_id', podId)
        .eq('user_id', userId)
        .single();

      if (membershipError || !membership) {
        throw createError('Pod not found or access denied', 404);
      }
    }

    const { data: members, error: membersError } = await supabase
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

    if (membersError) {
      throw createError('Failed to fetch pod members', 500);
    }

    // Check if user is a member
    const { data: userMembership } = await supabase
      .from('study_pod_members')
      .select('id')
      .eq('pod_id', podId)
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
      members: (members || []).map((m: any) => ({
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
      memberCount: members?.length || 0,
      isMember: !!userMembership,
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
    // Check if user is a member
    const { data: membership, error: membershipError } = await supabase
      .from('study_pod_members')
      .select('id')
      .eq('pod_id', podId)
      .eq('user_id', userId)
      .single();

    // For students, auto-join if not a member. For other roles, require membership
    if (membershipError || !membership) {
      if (userRole === 'student') {
        // Auto-join for students
        await this.joinPod(podId, userId);
      } else {
        throw createError('Not a member of this pod', 403);
      }
    }

    const { data: message, error: messageError } = await supabase
      .from('pod_messages')
      .insert({
        pod_id: podId,
        user_id: userId,
        content,
      })
      .select()
      .single();

    if (messageError || !message) {
      throw createError('Failed to send message', 500);
    }

    const recentMessages = await this.getMessages(podId, 10);
    const conversationContext = recentMessages
      .slice(-5)
      .map((msg) => `${msg.user?.full_name || 'User'}: ${msg.content}`)
      .join('\n');

    const aiPrompt = `You are an AI study guide helping a study group. The group just had this conversation:

${conversationContext}

Current message: ${content}

Provide helpful guidance, clarification, or study tips related to this discussion. Keep it concise (2-3 sentences) and educational.`;

    try {
      const aiGuidance = await this.openai.chatCompletion(
        [{ role: 'user', content: aiPrompt }],
        { stepByStep: false }
      );

      await supabase
        .from('pod_messages')
        .update({ ai_guidance: aiGuidance })
        .eq('id', message.id);

      return {
        ...message,
        ai_guidance: aiGuidance,
      };
    } catch (error) {
      return message;
    }
  }

  async getMessages(podId: string, limit: number = 50, userId?: string, userRole?: string): Promise<PodMessage[]> {
    // For students, allow viewing messages from any pod. For other roles, check membership
    if (userRole !== 'student' && userId) {
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

    return (messages || []).map((m: any) => ({
      id: m.id,
      pod_id: m.pod_id,
      user_id: m.user_id,
      content: m.content,
      ai_guidance: m.ai_guidance,
      created_at: m.created_at,
      user: m.users ? {
        id: m.users.id,
        email: m.users.email,
        full_name: m.users.full_name,
      } : undefined,
    }));
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

