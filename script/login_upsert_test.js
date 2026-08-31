(async () => {
  try {
    const code = process.argv[2] || 'TEST_NEW_1';
    const SUPA = 'https://gykfyiqujyiwchqgmsjx.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5a2Z5aXF1anlpd2NocWdtc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODU4MzcsImV4cCI6MjA4MzM2MTgzN30.x_kTc_EUfq2Y3cldzLwdHM0M7jcYIzAr37TRjsx3fqY';

    const headers = {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    };

    const normalized = code.trim();
    console.log('Login check for', normalized);

    const res = await fetch(
      `${SUPA}/rest/v1/users?select=*&employee_code=eq.${encodeURIComponent(normalized)}&limit=1`,
      { headers }
    );

    const data = await res.json();

    if (data.length === 0) {
      console.log('User not found');
    } else {
      console.log('User found:', data[0]);
    }

  } catch (err) {
    console.error('Test error', err);
  }
})();
