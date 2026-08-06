import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { UserProfile } from '../types';

function mapProfile(row: any, email?: string, organizationName?: string, recorderProfileId?: string): UserProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName,
    displayName: row.display_name,
    role: row.role,
    email,
    recorderProfileId,
  };
}

async function fetchProfile(activeSession: Session): Promise<UserProfile> {
  if (!supabase) throw new Error('Supabaseが設定されていません。');

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, organization_id, display_name, role, active')
    .eq('id', activeSession.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`利用者プロフィールを取得できませんでした: ${profileError.message}`);
  }
  if (!profileRow) {
    throw new Error('利用者プロフィールが見つかりません。管理者に職員登録状況をご確認ください。');
  }
  if (!profileRow.active) {
    throw new Error('このアカウントは利用停止中です。管理者にお問い合わせください。');
  }

  // 事業所名の取得だけに失敗しても、記録画面へのログインは妨げない。
  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', profileRow.organization_id)
    .maybeSingle();

  const { data: recorderProfileId, error: recorderError } = await supabase.rpc('current_recorder_profile_id');
  if (recorderError && recorderError.code !== 'PGRST202') {
    throw new Error(`職員情報を確認できませんでした: ${recorderError.message}`);
  }
  if (activeSession.user.user_metadata?.login_method === 'staff_id' && typeof recorderProfileId !== 'string') {
    throw new Error('この職員IDは記録者名簿と正しく紐付いていないか、利用停止中です。管理者にお問い合わせください。');
  }

  return mapProfile(
    profileRow,
    activeSession.user.user_metadata?.login_method === 'staff_id' ? undefined : activeSession.user.email,
    organization?.name,
    typeof recorderProfileId === 'string' ? recorderProfileId : undefined,
  );
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(!isSupabaseConfigured);
  const [profileReloadKey, setProfileReloadKey] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setInitialized(true);
      setLoading(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(`認証状態を確認できませんでした: ${sessionError.message}`);
      setSession(data.session);
      setInitialized(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      // Do not discard a usable session because a background refresh or a
      // temporary connection transition emitted an event without a session.
      // An actual sign-out still clears it immediately.
      if (event === 'SIGNED_OUT') {
        setSession(null);
      } else if (nextSession) {
        setSession(nextSession);
      }
      setInitialized(true);
    });

    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void supabase.auth.getSession().then(({ data }) => {
        if (active && data.session) setSession(data.session);
      });
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!session) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    void fetchProfile(session)
      .then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
        setError(null);
      })
      .catch((profileError: unknown) => {
        if (!active) return;
        setProfile(null);
        setError(profileError instanceof Error ? profileError.message : '利用者プロフィールを取得できませんでした。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialized, profileReloadKey, session]);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabaseが設定されていません。') };
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return { error: signInError };
    }

    // Authイベントだけに依存せず、成功時のセッションを確実に画面へ反映する。
    setSession(data.session);
    setInitialized(true);
    return { error: null };
  };

  const signInWithStaffId = async (organizationCode: string, employeeCode: string, password: string) => {
    if (!supabase) return { error: new Error('Supabaseが設定されていません。') };
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('staff-login', {
      body: { organizationCode, employeeCode, password },
    });
    if (invokeError) {
      let message = invokeError.message;
      const context = (invokeError as { context?: Response }).context;
      if (context) {
        try {
          const payload = await context.clone().json() as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // Keep the SDK error message when the function did not return JSON.
        }
      }
      return { error: new Error(message || '職員IDでログインできませんでした。') };
    }
    const nextSession = data?.session as { access_token?: string; refresh_token?: string } | undefined;
    if (!nextSession?.access_token || !nextSession.refresh_token) {
      return { error: new Error('ログイン情報を受け取れませんでした。管理者にお問い合わせください。') };
    }
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: nextSession.access_token,
      refresh_token: nextSession.refresh_token,
    });
    if (sessionError || !sessionData.session) {
      return { error: sessionError || new Error('ログイン状態を開始できませんでした。') };
    }
    setSession(sessionData.session);
    setInitialized(true);
    return { error: null };
  };

  const signOut = async () => {
    if (!supabase) return;
    setLoading(true);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(`ログアウトできませんでした: ${signOutError.message}`);
      setLoading(false);
      return;
    }
    setSession(null);
    setProfile(null);
    setLoading(false);
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
    return { error: null };
  };

  const reloadProfile = useCallback(() => {
    setProfileReloadKey((current) => current + 1);
  }, []);

  return {
    configured: isSupabaseConfigured,
    session,
    profile,
    needsPasswordSetup: Boolean(session?.user.user_metadata?.needs_password_setup),
    loading,
    error,
    signIn,
    signInWithStaffId,
    completePasswordSetup,
    signOut,
    reloadProfile,
  };
}
