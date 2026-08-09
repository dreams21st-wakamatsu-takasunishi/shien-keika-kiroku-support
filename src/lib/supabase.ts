import { createClient } from '@supabase/supabase-js';
import { getAccessDeviceToken } from '../utils/accessDevice';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = import.meta.env.VITE_FORCE_LOCAL_MODE !== 'true'
  && Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      global: {
        fetch: (input, init) => {
          const requestUrl = typeof input === 'string' ? input : input.url;
          if (!requestUrl.includes('/rest/v1/')) return fetch(input, init);
          const headers = new Headers(init?.headers || (typeof input === 'string' ? undefined : input.headers));
          headers.set('x-support-device-token', getAccessDeviceToken());
          return fetch(input, { ...init, headers });
        },
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    })
  : null;
