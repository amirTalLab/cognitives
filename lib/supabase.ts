import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials not configured');
    return null;
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
}

// For backwards compatibility - lazy getter
export const supabase = {
  from: (table: string) => {
    const client = getSupabase();
    if (!client) {
      const notConfiguredError = { error: new Error('Supabase not configured') };
      const mockQuery = {
        insert: () => Promise.resolve(notConfiguredError),
        select: () => mockQuery,
        order: () => mockQuery,
        eq: () => Promise.resolve(notConfiguredError),
        neq: () => Promise.resolve(notConfiguredError),
        delete: () => mockQuery,
        then: (resolve: (value: { data: never[]; error: Error }) => void) =>
          resolve({ data: [], error: new Error('Supabase not configured') }),
      };
      return mockQuery as unknown as ReturnType<SupabaseClient['from']>;
    }
    return client.from(table);
  },
};
