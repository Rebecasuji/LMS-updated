(async () => {
  try {
    const SUPA = 'https://gykfyiqujyiwchqgmsjx.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5a2Z5aXF1anlpd2NocWdtc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODU4MzcsImV4cCI6MjA4MzM2MTgzN30.x_kTc_EUfq2Y3cldzLwdHM0M7jcYIzAr37TRjsx3fqY';
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

    const tries = [
      '*',
      'id,user_id,username,role,password',
      'user_id,username,role',
      'id,username,name,role',
      'id,user_id,username,name,role,email',
      'id,user_id'
    ];

    for (const q of tries) {
      try {
        console.log('Trying select=', q);
        const res = await fetch(`${SUPA}/rest/v1/users?select=${encodeURIComponent(q)}&limit=1`, { headers });
        console.log('Status', res.status);
        console.log(await res.text());
      } catch (e) {
        console.log('Request error for select', q, e);
      }
    }
  } catch (err) {
    console.error('Inspect error', err);
    process.exitCode = 2;
  }
})();
