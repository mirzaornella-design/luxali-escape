// Приём заявки с сайта: проверка → запись в Supabase → уведомление в Telegram.
// Все ключи берутся из переменных окружения Vercel, в коде их нет.

const LETTERS = /[A-Za-zА-Яа-яЁёĂăÂâÎîȘșȚț]/g;
const TZ = 'Europe/Chisinau';

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function validate(body) {
  const lead = {
    name: clean(body.name, 80),
    phone: clean(body.phone, 25),
    comment: clean(body.comment, 2000),
    choices: clean(body.choices, 4000) || null,
    lang: body.lang === 'en' ? 'en' : 'ru',
  };
  const errors = {};
  if (!lead.name) errors.name = 'required';
  else if ((lead.name.match(LETTERS) || []).length < 2) errors.name = 'too_short';
  const digits = lead.phone.replace(/\D/g, '');
  if (!lead.phone) errors.phone = 'required';
  else if (!/^\+?[\d\s().-]+$/.test(lead.phone)) errors.phone = 'format';
  else if (digits.length < 8 || digits.length > 15) errors.phone = 'length';
  if (!lead.comment) errors.comment = 'required';
  else if (lead.comment.length < 3) errors.comment = 'too_short';
  return { lead, errors: Object.keys(errors).length ? errors : null };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(date, timeZone) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date);
}

function telegramText(row) {
  const at = new Date(row.created_at);
  const lines = [
    `<b>🆕 Новая заявка #${row.id}</b>`,
    '',
    `<b>Имя:</b> ${esc(row.name)}`,
    `<b>Телефон:</b> ${esc(row.phone)}`,
    `<b>Комментарий:</b> ${esc(row.comment)}`,
    '',
    `<b>Время:</b> ${fmt(at, TZ)} (Кишинёв)`,
    `<b>В базе (UTC):</b> ${fmt(at, 'UTC')}`,
    `<b>Статус:</b> ${esc(row.status)}`,
    `<b>Язык сайта:</b> ${row.lang === 'en' ? 'английский' : 'русский'}`,
  ];
  if (row.choices) {
    lines.push('', '<b>Выбор в тесте:</b>', esc(row.choices.slice(0, 2500)));
  }
  return lines.join('\n').slice(0, 4000);
}

function supabaseHeaders(key) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  // Старые ключи — JWT, их нужно передавать и в Authorization. Новые (sb_secret_…) — только в apikey.
  if (!key.startsWith('sb_')) h.Authorization = `Bearer ${key}`;
  return h;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = await readBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'bad_request' });
  }
  // Ловушка для ботов: настоящий посетитель это поле не видит и не заполняет.
  if (clean(body.website, 200)) return res.status(200).json({ ok: true });

  const { lead, errors } = validate(body);
  if (errors) return res.status(400).json({ ok: false, error: 'validation', fields: errors });

  const { SUPABASE_URL, SUPABASE_SECRET_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error('lead: Supabase env vars are missing');
    return res.status(500).json({ ok: false, error: 'not_configured' });
  }

  let row;
  try {
    const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads?select=id,created_at,status,name,phone,comment,choices,lang`, {
      method: 'POST',
      headers: { ...supabaseHeaders(SUPABASE_SECRET_KEY), Prefer: 'return=representation' },
      body: JSON.stringify(lead),
    });
    if (!r.ok) {
      console.error('lead: Supabase insert failed', r.status, (await r.text()).slice(0, 300));
      return res.status(r.status === 400 ? 400 : 502).json({ ok: false, error: 'save_failed' });
    }
    [row] = await r.json();
  } catch (e) {
    console.error('lead: Supabase unreachable', e && e.message);
    return res.status(502).json({ ok: false, error: 'save_failed' });
  }

  let notified = false;
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      const t = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: telegramText(row),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      notified = t.ok;
      if (!t.ok) console.error('lead: Telegram failed', t.status, (await t.text()).slice(0, 300));
    } catch (e) {
      console.error('lead: Telegram unreachable', e && e.message);
    }
  } else {
    console.error('lead: Telegram env vars are missing');
  }

  // Заявка уже сохранена, поэтому клиент получает подтверждение, даже если Telegram не ответил.
  return res.status(200).json({ ok: true, id: row.id, notified });
};

module.exports.validate = validate;
module.exports.telegramText = telegramText;
