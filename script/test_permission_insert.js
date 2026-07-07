(async () => {
  try {
    const SUPA = 'https://gykfyiqujyiwchqgmsjx.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5a2Z5aXF1anlpd2NocWdtc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODU4MzcsImV4cCI6MjA4MzM2MTgzN30.x_kTc_EUfq2Y3cldzLwdHM0M7jcYIzAr37TRjsx3fqY';
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

    const body = { user_id: 'E0041', permission_type: 'early_exit', from_time: '09:00', to_time: '10:00', reason: 'ui-write-test', additional_info: 'test' };
    console.log('Trying permission insert:', body);
    const res = await fetch(`${SUPA}/rest/v1/permissions`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(body) });
    console.log('Status', res.status);
    console.log(await res.text());
  } catch (err) {
    console.error('Test error', err);
    process.exitCode = 2;
  }
})();
