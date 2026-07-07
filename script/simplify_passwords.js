(async () => {
  try {
    const SUPA = 'https://gykfyiqujyiwchqgmsjx.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5a2Z5aXF1anlpd2NocWdtc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODU4MzcsImV4cCI6MjA4MzM2MTgzN30.x_kTc_EUfq2Y3cldzLwdHM0M7jcYIzAr37TRjsx3fqY';
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

    console.log('Fetching users...');
    const res = await fetch(`${SUPA}/rest/v1/users?select=user_id,username`, { headers });
    if (res.status !== 200) {
      console.error('Failed to fetch users', res.status, await res.text());
      process.exitCode = 2;
      return;
    }
    const users = await res.json();
    if (!Array.isArray(users) || users.length === 0) {
      console.log('No users found');
      return;
    }

    const updated = [];
    for (const u of users) {
      const id = (u.user_id && u.user_id.toString().trim()) ? u.user_id.toString().trim() : (u.username ? u.username.toString().trim() : null);
      if (!id) continue;
      const newPwd = id + '123';
      const patchRes = await fetch(`${SUPA}/rest/v1/users?user_id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ password: newPwd }) });
      const text = await patchRes.text();
      if (patchRes.status >= 200 && patchRes.status < 300) {
        console.log('Updated', id);
        updated.push({ user_id: id, password: newPwd });
      } else {
        console.error('Failed to update', id, patchRes.status, text);
      }
    }

    console.log('\nPassword update complete. New passwords:');
    for (const u of updated) console.log(`${u.user_id} \t ${u.password}`);

  } catch (err) {
    console.error('Script error', err);
    process.exitCode = 2;
  }
})();
