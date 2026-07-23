import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { UserProfile } from '../types';

function mapProfile(row: any, email?: string): UserProfile {
  const organization = Array.isArray(row.organizations)
    ? row.organizations[0]
    : row.organizations;

  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: organization?.name,
    displayName: row.display_name,
    role: row.role,
    email,
  };
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!supabase || !activeSession?.user) {
      setProfile(null);
      return;
    }

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, organization_id, display_name, role, organizations(name)')
      .eq('id', activeSession.user.id)
      .single();

    if (profileError) {
      setError(`利用者プロフィールを取得できませんでした: ${profileError.message}`);
      setProfile(null);
      return;
    }

    setError(null);
    setProfile(mapProfile(data, activeSession.user.email));
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession).finally(() => setLoading(false));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabaseが設定されていません。') };
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    organizationName: string
  ) => {
    if (!supabase) return { error: new Error('Supabaseが設定されていません。') };
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          organization_name: organizationName,
        },
      },
    });
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  const completePasswordSetup = async (password: string) => {
    if (!supabase || !session) {
      return { error: new Error('招待セッションを確認できません。招待メールのリンクをもう一度開いてください。') };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: {
        ...session.user.user_metadata,
        needs_password_setup: false,
      },
    });
    if (updateError) return { error: updateError };

    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) return { error: refreshError };
    setSession(data.session);
    await loadProfile(data.session);
    return { error: null };
  };

  return {
    configured: isSupabaseConfigured,
    session,
    profile,
    needsPasswordSetup: Boolean(session?.user.user_metadata?.needs_password_setup),
    loading,
    error,
    signIn,
    signUp,
    completePasswordSetup,
    signOut,
    reloadProfile: () => loadProfile(session),
  };
}
