import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseServer: ReturnType<typeof createClient> | null = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  } catch (err) {
    console.error('[SUPABASE] Failed to initialize server client:', err);
    supabaseServer = null;
  }
} else {
  console.warn('[SUPABASE] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — server-side Supabase disabled');
}

export async function getNotificationEmailsServer(): Promise<{ adminEmails: string[]; hrEmails: string[] }> {
  try {
    if (!supabaseServer) {
      throw new Error('Supabase server client not initialized');
    }

    const { data, error } = await supabaseServer
      .from('users')
      .select('*')
      .in('role', ['admin', 'hr']);

    if (error) {
      console.error('Error fetching notification users from Supabase (server):', error);
      throw error;
    }

    const adminEmails: string[] = [];
    const hrEmails: string[] = [];

    (data || []).forEach((u: any) => {
      const email = u.email || u.contact_email || (u.username ? `${u.username.toLowerCase()}@ctint.in` : null);
      if (!email) return;
      if ((u.role || '').toString().toLowerCase() === 'admin') adminEmails.push(email);
      if ((u.role || '').toString().toLowerCase() === 'hr') hrEmails.push(email);
    });

    return { adminEmails, hrEmails };
  } catch (err) {
    console.error('getNotificationEmailsServer error:', err);
    // fallback to ADMIN_EMAIL env var (comma separated)
    const DEFAULT_ADMIN_EMAILS = (process.env.ADMIN_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
    return { adminEmails: DEFAULT_ADMIN_EMAILS, hrEmails: [] };
  }
}

export { supabaseServer };
