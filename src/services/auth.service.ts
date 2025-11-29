import { supabase } from '../config/database';
import { CreateUserDto, User, LoginDto } from '../types/user.types';
import { createError } from '../middleware/error.middleware';

export class AuthService {
  async register(userData: CreateUserDto): Promise<{ user: User; token: string }> {
    const { email, password, full_name, role, language_preference } = userData;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !authData.user) {
      console.error('Auth user creation failed:', authError);
      throw createError(authError?.message || 'Registration failed', 400);
    }

    console.log('Auth user created successfully:', { userId: authData.user.id, email });

    let user: User | null = null;
    let userError: any = null;

    try {
      const { data: userData, error: insertError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          full_name: full_name || null,
          role,
          language_preference: language_preference || 'en',
          simplified_mode: false,
        })
        .select()
        .single();

      if (insertError || !userData) {
        userError = insertError;
      } else {
        const { data: verifiedUser, error: verifyError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (verifyError || !verifiedUser) {
          userError = verifyError || new Error('User created but could not be verified');
        } else {
          user = verifiedUser;
        }
      }
    } catch (error) {
      userError = error;
    }

    if (userError || !user) {
      try {
        const { data: userData, error: rpcError } = await supabase.rpc('create_user_profile', {
          p_id: authData.user.id,
          p_email: email,
          p_full_name: full_name || null,
          p_role: role,
          p_language_preference: language_preference || 'en',
          p_simplified_mode: false,
        });

        if (rpcError) {
          throw rpcError;
        }

        const { data: verifiedUser, error: verifyError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (verifyError || !verifiedUser) {
          throw new Error('User profile created but could not be verified');
        }

        user = verifiedUser;
        userError = null;
      } catch (rpcError) {
        console.error('User creation error (both methods failed):', userError, rpcError);
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('Failed to delete auth user after registration failure:', deleteError);
        }
        const errorMessage = 
          (userError as any)?.message || 
          (rpcError as any)?.message || 
          'Failed to create user profile. Please check database permissions.';
        throw createError(errorMessage, 500);
      }
    }

    if (!user) {
      console.error('User record is null after all creation attempts');
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
      } catch (deleteError) {
        console.error('Failed to delete auth user after registration failure:', deleteError);
      }
      throw createError('Failed to create user profile', 500);
    }

    console.log('User profile created successfully:', { userId: user.id, email: user.email, role: user.role });

    let session = authData.session;

    if (!session) {
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        authData.user.id,
        { email_confirm: true }
      );

      if (updateError) {
        console.error('Failed to confirm user email:', updateError);
      }

      const { data: { session: newSession }, error: sessionError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (sessionError || !newSession) {
        console.error('Session creation error:', sessionError);
        const errorMessage = sessionError?.message || 'Failed to create session';
        throw createError(errorMessage, 500);
      }
      
      session = newSession;
    }

    return {
      user,
      token: session.access_token,
    };
  }

  async login(credentials: LoginDto): Promise<{ user: User; token: string }> {
    const { email, password } = credentials;

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.session) {
      throw createError('Invalid email or password', 401);
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !user) {
      throw createError('User not found', 404);
    }

    return {
      user,
      token: authData.session.access_token,
    };
  }

  async getProfile(userId: string): Promise<User> {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw createError('User not found', 404);
    }

    return user;
  }

  async updateProfile(userId: string, updates: Partial<User>): Promise<User> {
    const { data: user, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error || !user) {
      throw createError('Failed to update profile', 500);
    }

    return user;
  }
}

