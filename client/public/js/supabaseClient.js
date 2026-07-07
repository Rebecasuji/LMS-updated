import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
  "https://gykfyiqujyiwchqgmsjx.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5a2Z5aXF1anlpd2NocWdtc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODU4MzcsImV4cCI6MjA4MzM2MTgzN30.x_kTc_EUfq2Y3cldzLwdHM0M7jcYIzAr37TRjsx3fqY"
);

// Usage (in any module):
// import { supabase } from '/js/supabaseClient.js';
// Example: const { data, error } = await supabase.from('leaves').select('*');
