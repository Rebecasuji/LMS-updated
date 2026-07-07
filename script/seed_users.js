(async () => {
  try {
    const SUPA = 'https://gykfyiqujyiwchqgmsjx.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5a2Z5aXF1anlpd2NocWdtc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODU4MzcsImV4cCI6MjA4MzM2MTgzN30.x_kTc_EUfq2Y3cldzLwdHM0M7jcYIzAr37TRjsx3fqY';
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

    function genPassword() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#';
      let out = '';
      for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
      return out;
    }

    // Source list (from your attachment / existing INITIAL_USERS)
    const seeds = [
      { name: 'SAM PARKESH', code: 'A0001', designation: 'Director', role: 'admin' },
      { name: 'LEO CLESTINE', code: 'A0002', designation: 'Manager', role: 'admin' },
      { name: 'SUJI', code: 'A0003', designation: 'Manager', role: 'admin' },
      { name: 'MOHAN RAJ C', code: 'E0041', designation: 'Finance Executive', role: 'employee' },
      { name: 'YUVARAJ S', code: 'E0042', designation: 'Purchase Executive', role: 'employee' },
      { name: 'ATMAKUR RAJESH', code: 'E0043', designation: 'HR & Admin', role: 'hr' },
      { name: 'SIVARAM C', code: 'E0032', designation: 'Multi Technician', role: 'employee' },
      { name: 'UMAR FAROOQUE', code: 'E0040', designation: 'Site Engineer', role: 'employee' },
      { name: 'KAALIPUSHPA R', code: 'E0028', designation: 'Quantity Analyst', role: 'employee' },
      { name: 'DENNIS RAJU', code: 'E0035', designation: 'Finance Analyst', role: 'employee' },
      { name: 'RANJITH', code: 'E0009', designation: 'Director/Ops Manager', role: 'employee' },
      { name: 'PRIYA P', code: 'E0044', designation: 'Finance Assistant', role: 'employee' },
      { name: 'RATCHITHA', code: 'E0045', designation: 'Business Development Executive', role: 'employee' },
      { name: 'FAREETHA', code: '', designation: 'House Keeping', role: 'employee' },
      { name: 'Samyuktha S', code: 'E0047', designation: 'HR -Intern', role: 'hr' },
      { name: 'Rebecasuji.A', code: 'E0046', designation: 'Software developer intern', role: 'employee' },
      { name: 'DurgaDevi E', code: 'E0048', designation: 'Software developer intern', role: 'employee' },
      { name: 'ZAMEELA BEGAM N.', code: 'E0050', designation: 'Finance Intern', role: 'employee' },
      { name: 'ARUN KUMAR V.', code: 'E0051', designation: 'Finance Intern', role: 'employee' },
      { name: 'D K JYOTHSNA PRIYA', code: 'E0052', designation: 'Software developer intern', role: 'employee' },
      { name: 'P PUSHPA', code: 'E0049', designation: 'HR& Admin', role: 'hr' },
      { name: 'S.NAVEEN KUMAR', code: 'E0053', designation: 'TECHNICAL SUPPORT', role: 'employee' }
    ];

    // 1) List existing users
    console.log('Fetching existing users...');
    const getRes = await fetch(`${SUPA}/rest/v1/users?select=user_id`, { headers });
    if (getRes.status !== 200) {
      console.error('Failed to list users', getRes.status, await getRes.text());
      process.exitCode = 2;
      return;
    }
    const existing = await getRes.json();
    console.log('Existing users count:', existing.length);

    // 2) Delete referencing rows (permissions, leaves) then delete each existing user
    for (const u of existing) {
      const uid = u.user_id;
      if (!uid) continue;

      // delete permissions for user
      try {
        const delPerm = await fetch(`${SUPA}/rest/v1/permissions?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE', headers });
        if (delPerm.status >= 200 && delPerm.status < 300) console.log('Deleted permissions for', uid);
      } catch (e) {
        console.warn('Failed deleting permissions for', uid, e);
      }

      // delete leaves for user
      try {
        const delLeaves = await fetch(`${SUPA}/rest/v1/leaves?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE', headers });
        if (delLeaves.status >= 200 && delLeaves.status < 300) console.log('Deleted leaves for', uid);
      } catch (e) {
        console.warn('Failed deleting leaves for', uid, e);
      }

      // now delete user
      try {
        const del = await fetch(`${SUPA}/rest/v1/users?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE', headers });
        if (del.status >= 200 && del.status < 300) {
          console.log('Deleted user', uid);
        } else {
          console.warn('Failed to delete', uid, del.status, await del.text());
        }
      } catch (e) {
        console.warn('Error deleting user', uid, e);
      }
    }

    // 3) Insert seeds and collect passwords
    const created = [];
    for (const s of seeds) {
      const username = (s.code && s.code.trim()) ? s.code.trim() : s.name.replace(/\s+/g, '').toUpperCase();
      const user_id = username;
      const pwd = genPassword();
      // Use only columns that exist in the current schema to avoid schema-cache errors
      const payload = {
        user_id,
        username,
        role: s.role,
        password: pwd
      };

      const ins = await fetch(`${SUPA}/rest/v1/users`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(payload) });
      const text = await ins.text();
      if (ins.status >= 200 && ins.status < 300) {
        console.log('Inserted', user_id);
        created.push({ user_id, username, name: s.name, password: pwd, role: s.role });
      } else {
        console.error('Failed to insert', user_id, ins.status, text);
      }
    }

    // 4) Summary output
    console.log('\nSeeding complete. Passwords:');
    for (const c of created) {
      console.log(`${c.user_id} \t ${c.name} \t ${c.role} \t ${c.password}`);
    }

  } catch (err) {
    console.error('Seed script error', err);
    process.exitCode = 2;
  }
})();
