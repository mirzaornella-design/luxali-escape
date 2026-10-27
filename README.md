# Luxali Escape — мудборд-тест с формой заявки

Сайт-тест для интерьера веганского ретрит-центра Luxali Escape (11 шагов, RU / EN) с формой заявки.

## Как устроено

```
Посетитель → форма на сайте → /api/lead (Vercel) ─┬→ Supabase: таблица leads
                                                  └→ Telegram: сообщение владельцу
```

- `public/index.html` — сам сайт. В нём нет ни одного ключа: форма отправляет заявку только на `/api/lead`.
- `api/lead.js` — серверная функция Vercel. Проверяет поля, сохраняет заявку в Supabase и сразу отправляет уведомление в Telegram.
- `supabase/leads.sql` — таблица заявок: дата создания, статус («новая», «в работе», «закрыта»), проверки полей, доступ только для сервера.
- `test/lead.test.js` — проверка серверной функции без сети: `npm test`.

## Ключи

Все ключи хранятся только в Vercel → Project → Settings → Environment Variables. В коде и в репозитории их нет (см. `.env.example` — там только имена).

| Переменная | Где взять |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret key |
| `TELEGRAM_BOT_TOKEN` | @BotFather → токен бота |
| `TELEGRAM_CHAT_ID` | @userinfobot → ваш Id (перед этим нажмите Start у своего бота) |

После изменения переменных нужен повторный деплой (Deployments → Redeploy).

## Проверка поля

- Имя: минимум 2 буквы, до 80 символов.
- Телефон: только цифры, пробелы и `+ - ( ) .`, от 8 до 15 цифр.
- Комментарий: от 3 до 2000 символов.

Те же правила проверяются в браузере, на сервере и в самой базе.

## Где смотреть заявки

Supabase → проект luxali-escape → Table Editor → `leads`. Статус меняется прямо в таблице.
