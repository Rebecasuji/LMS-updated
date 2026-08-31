(async () => {
  try {
    const SUPA = 'https://gykfyiqujyiwchqgmsjx.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5a2Z5aXF1anlpd2NocWdtc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODU4MzcsImV4cCI6MjA4MzM2MTgzN30.x_kTc_EUfq2Y3cldzLwdHM0M7jcYIzAr37TRjsx3fqY';
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

    console.log('Fetching 1 user row to inspect columns...');
    let res = await fetch(`${SUPA}/rest/v1/users?select=*&limit=1`, { headers });
    console.log('Users status', res.status);
    const usersText = await res.text();
    console.log(usersText);

    console.log('Fetching permission types sample to inspect allowed values...');
    let permSample = await fetch(`${SUPA}/rest/v1/permissions?select=permission_type&limit=5`, { headers });
    console.log('Permissions sample status', permSample.status);
    console.log(await permSample.text());

    console.log('Attempting various user insert payloads to seed test user...');
    const userPayloads = [
      { username: 'E0041', password: 'test' },
      { id: '4', username: 'E0041', password: 'test' },
      { user_id: '4', username: 'E0041', password: 'test' },
      { username: 'E0041' },
    ];

    for (const p of userPayloads) {
      try {
        const r = await fetch(`${SUPA}/rest/v1/users`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(p) });
        console.log('Tried payload:', JSON.stringify(p), '=>', r.status);
        console.log(await r.text());
      } catch (e) {
        console.log('Request error for payload', JSON.stringify(p), e);
      }
    }

    console.log('Attempting to insert permission (test)...');
    const body = { user_id: '4', permission_type: 'early_exit', from_time: '09:00', to_time: '10:00', reason: 'test from script', additional_info: 'script-test' };
    res = await fetch(`${SUPA}/rest/v1/permissions`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(body) });
    console.log('Insert status', res.status);
    console.log(await res.text());
  } catch (err) {
    console.error('Script error', err);
    process.exitCode = 2;
  }
})();
