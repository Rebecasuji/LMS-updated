(async () => {
  try {
    const SUPA = 'https://gykfyiqujyiwchqgmsjx.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5a2Z5aXF1anlpd2NocWdtc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODU4MzcsImV4cCI6MjA4MzM2MTgzN30.x_kTc_EUfq2Y3cldzLwdHM0M7jcYIzAr37TRjsx3fqY';
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

    const roles = ['Employee','employee','Admin','admin','ADMIN','EMPLOYEE','Staff','User'];
    for (const r of roles) {
      const payload = { user_id: 'E0041_'+r, username: 'E0041_'+r, role: r, password: 'test' };
      console.log('Trying role:', r);
      const res = await fetch(`${SUPA}/rest/v1/users`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(payload) });
      console.log('Role', r, 'Status', res.status);
      console.log(await res.text());
      // If inserted, delete to keep table clean
      if (res.status >= 200 && res.status < 300) {
        const body = await res.json();
        const uid = body[0] && (body[0].user_id || body[0].username);
        if (uid) {
          await fetch(`${SUPA}/rest/v1/users?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE', headers });
          console.log('Deleted inserted test user', uid);
        }
      }
    }
  } catch (err) {
    console.error('roles test error', err);
    process.exitCode = 2;
  }
})();
