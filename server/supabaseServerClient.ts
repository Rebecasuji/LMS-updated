import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://gykfyiqujyiwchqgmsjx.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5a2Z5aXF1anlpd2NocWdtc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODU4MzcsImV4cCI6MjA4MzM2MTgzN30.x_kTc_EUfq2Y3cldzLwdHM0M7jcYIzAr37TRjsx3fqY';

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_KEY;

let supabaseServer: ReturnType<typeof createClient> | null = null;
try {
  supabaseServer = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (err) {
  console.error('[SUPABASE] Failed to initialize server client:', err);
  supabaseServer = null;
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
