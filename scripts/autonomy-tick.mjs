const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
const adminKey = (process.env.ADMIN_KEY || '').trim();

if (!appUrl) {
  console.error('[autonomy-tick] Missing APP_URL');
  process.exit(1);
}

if (!adminKey) {
  console.error('[autonomy-tick] Missing ADMIN_KEY');
  process.exit(1);
}

const url = `${appUrl}/api/autonomy/tick`;

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
    },
  });
  const text = await res.text();

  console.log(`[autonomy-tick] status=${res.status} url=${url}`);
  console.log(text);

  if (!res.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error('[autonomy-tick] Request failed:', error);
  process.exit(1);
}
