// Проверка api/lead.js без сети: fetch подменяется заглушкой.
const assert = require('assert');
const handler = require('../api/lead.js');

function mockRes() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
const calls = [];
let supaStatus = 201, tgStatus = 200;
global.fetch = async (url, opts) => {
  calls.push({ url, opts });
  if (url.includes('/rest/v1/leads')) {
    const b = JSON.parse(opts.body);
    return { ok: supaStatus < 300, status: supaStatus, text: async () => 'err',
      json: async () => [{ id: 7, created_at: '2026-10-27T20:31:05.123+00:00', status: 'новая', ...b }] };
  }
  return { ok: tgStatus < 300, status: tgStatus, text: async () => 'tg err' };
};
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.TELEGRAM_BOT_TOKEN = '123:TEST';
process.env.TELEGRAM_CHAT_ID = '42';

(async () => {
  let res = mockRes(); await handler({ method: 'GET' }, res);
  assert.equal(res.code, 405);

  res = mockRes(); await handler({ method: 'POST', body: { name: '', phone: 'abc', comment: '' } }, res);
  assert.equal(res.code, 400); assert.deepEqual(Object.keys(res.body.fields).sort(), ['comment', 'name', 'phone']);
  assert.equal(calls.length, 0, 'invalid lead must not reach Supabase');

  res = mockRes(); await handler({ method: 'POST', body: { name: 'Анна', phone: '1234', comment: 'ok ok' } }, res);
  assert.equal(res.body.fields.phone, 'length');

  res = mockRes(); await handler({ method: 'POST', body: { name: 'Bot', phone: '+37369123456', comment: 'spam', website: 'x' } }, res);
  assert.equal(res.code, 200); assert.equal(calls.length, 0, 'honeypot must not save');

  res = mockRes(); await handler({ method: 'POST', body: JSON.stringify({ name: ' Анна <b> ', phone: '+373 69 123 456', comment: 'Позвоните & вечером', choices: 'Мудборд: X', lang: 'ru', status: 'закрыта', created_at: '2000-01-01' }) }, res);
  assert.equal(res.code, 200); assert.deepEqual(res.body, { ok: true, id: 7, notified: true });
  const [sb, tg] = calls;
  const sent = JSON.parse(sb.opts.body);
  assert.deepEqual(Object.keys(sent).sort(), ['choices', 'comment', 'lang', 'name', 'phone'], 'client cannot set status/date');
  assert.equal(sent.name, 'Анна <b>');
  assert.equal(sb.opts.headers.apikey, 'sb_secret_test'); assert.ok(!sb.opts.headers.Authorization);
  assert.equal(tg.url, 'https://api.telegram.org/bot123:TEST/sendMessage');
  const msg = JSON.parse(tg.opts.body);
  assert.equal(msg.chat_id, '42'); assert.equal(msg.parse_mode, 'HTML');
  assert.ok(msg.text.includes('Анна &lt;b&gt;') && msg.text.includes('Позвоните &amp; вечером'));
  assert.ok(msg.text.includes('27.10.2026, 22:31:05 (Кишинёв)'), msg.text);
  assert.ok(msg.text.includes('27.10.2026, 20:31:05'), 'UTC time as shown in Supabase');
  console.log('--- telegram text ---\n' + msg.text + '\n---');

  calls.length = 0; tgStatus = 500;
  res = mockRes(); await handler({ method: 'POST', body: { name: 'Анна', phone: '+37369123456', comment: 'тест' } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.notified, false, 'lead saved even if Telegram fails');

  calls.length = 0; supaStatus = 500;
  res = mockRes(); await handler({ method: 'POST', body: { name: 'Анна', phone: '+37369123456', comment: 'тест' } }, res);
  assert.equal(res.code, 502); assert.equal(calls.length, 1, 'no Telegram when save failed');

  delete process.env.SUPABASE_SECRET_KEY;
  res = mockRes(); await handler({ method: 'POST', body: { name: 'Анна', phone: '+37369123456', comment: 'тест' } }, res);
  assert.equal(res.code, 500);
  console.log('all tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
