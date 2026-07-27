/**
 * Cloudflare Pages Function — /dev/members
 * Password-protected admin view of kg_km_members.
 * Query ?csv=1 to download as CSV.
 * Query ?pw=<password> to authenticate (or use env.DEV_PASSWORD).
 */

const SUPABASE_URL = 'https://uejdsmaejdoupecgtzuj.supabase.co';

function unauthorized() {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Members Admin — The Kindness Mob</title>
  <link rel="icon" href="/assets/images/favicon.ico">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#111;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;}
    .card{background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:48px;width:100%;max-width:380px;text-align:center;}
    h1{font-size:1.4rem;font-weight:800;margin-bottom:6px;}
    p{color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:28px;}
    input{width:100%;padding:12px 16px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;font-size:1rem;margin-bottom:16px;}
    input:focus{outline:none;border-color:#C8281A;}
    button{width:100%;padding:13px;background:#C8281A;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;}
    button:hover{background:#a81f0f;}
    .err{color:#fc8181;font-size:0.85rem;margin-top:12px;}
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:2rem;margin-bottom:12px;">❤️</div>
    <h1>Members Admin</h1>
    <p>The Kindness Mob — internal use only</p>
    <form method="GET" action="/dev/members">
      <input type="password" name="pw" placeholder="Password" autofocus required>
      <button type="submit">Enter</button>
    </form>
    <p class="err" id="err" style="display:none">Wrong password.</p>
  </div>
</body>
</html>`, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'WWW-Authenticate': 'FormBased' },
  });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const pw  = url.searchParams.get('pw') || '';
  const devPw = env.DEV_PASSWORD || 'kindnessmob2024';

  if (pw !== devPw) return unauthorized();

  const svcKey = env.SUPABASE_SERVICE_KEY;
  const csv    = url.searchParams.get('csv') === '1';

  // Fetch all members newest first
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kg_km_members?order=created_at.desc&limit=2000`,
    {
      headers: {
        'apikey': svcKey,
        'Authorization': 'Bearer ' + svcKey,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return new Response('DB error: ' + err, { status: 500 });
  }

  const members = await res.json();

  // CSV download
  if (csv) {
    const rows = [
      'First Name,Last Name,Email,Source,Joined',
      ...members.map(m =>
        [m.first_name, m.last_name, m.email, m.source, m.created_at]
          .map(v => `"${(v || '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\r\n');
    return new Response(rows, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="km-members-${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  }

  // HTML admin page
  const rows = members.map(m => `
    <tr>
      <td>${esc(m.first_name)}</td>
      <td>${esc(m.last_name)}</td>
      <td><a href="mailto:${esc(m.email)}" style="color:#C8281A;">${esc(m.email)}</a></td>
      <td>${esc(m.source)}</td>
      <td style="color:rgba(255,255,255,0.45);font-size:0.82rem;">${new Date(m.created_at).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Members Admin — The Kindness Mob</title>
  <link rel="icon" href="/assets/images/favicon.ico">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#111;color:#fff;min-height:100vh;padding:40px 24px;}
    .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:16px;}
    h1{font-size:1.6rem;font-weight:800;letter-spacing:-0.03em;}
    .count{background:#C8281A;color:#fff;font-weight:800;font-size:2rem;padding:0 14px;border-radius:100px;line-height:1.5;}
    .actions{display:flex;gap:12px;flex-wrap:wrap;}
    .btn{display:inline-block;padding:10px 20px;border-radius:8px;font-weight:600;font-size:0.875rem;text-decoration:none;cursor:pointer;border:none;}
    .btn-csv{background:#C8281A;color:#fff;}
    .btn-csv:hover{background:#a81f0f;}
    .btn-back{background:rgba(255,255,255,0.08);color:#fff;}
    .btn-back:hover{background:rgba(255,255,255,0.15);}
    .table-wrap{overflow-x:auto;border-radius:12px;border:1px solid rgba(255,255,255,0.08);}
    table{width:100%;border-collapse:collapse;font-size:0.9rem;}
    thead{background:#1a1a1a;}
    thead th{padding:12px 16px;text-align:left;font-size:0.7rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);}
    tbody tr{border-top:1px solid rgba(255,255,255,0.06);transition:background 0.15s;}
    tbody tr:hover{background:rgba(255,255,255,0.03);}
    td{padding:12px 16px;vertical-align:middle;}
    .empty{text-align:center;padding:64px;color:rgba(255,255,255,0.3);}
    .search{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 16px;color:#fff;font-size:0.9rem;width:100%;max-width:320px;margin-bottom:20px;}
    .search:focus{outline:none;border-color:#C8281A;}
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:16px;">
      <img src="/assets/images/logo-horizontal-white.png" alt="The Kindness Mob" style="height:32px;width:auto;">
      <h1>Members <span class="count">${members.length}</span></h1>
    </div>
    <div class="actions">
      <a href="/dev/members?pw=${encodeURIComponent(pw)}&csv=1" class="btn btn-csv">⬇ Download CSV</a>
      <a href="/" class="btn btn-back">← Back to Site</a>
    </div>
  </div>

  <input type="text" class="search" id="search" placeholder="Filter by name or email..." oninput="filterTable(this.value)">

  <div class="table-wrap">
    <table id="members-table">
      <thead>
        <tr>
          <th>First Name</th>
          <th>Last Name</th>
          <th>Email</th>
          <th>Source</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody id="tbody">
        ${members.length ? rows : '<tr><td colspan="5" class="empty">No members yet. Share that join link! ❤️</td></tr>'}
      </tbody>
    </table>
  </div>

  <script>
    function filterTable(q) {
      q = q.toLowerCase();
      document.querySelectorAll('#tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
