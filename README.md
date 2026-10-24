# SKY WAY TRAVEL AGENCY — starter system

This starter safely handles customer enquiries and admin-side quote/status/profit tracking. It does **not** issue airline tickets or confirm hotel/visa bookings automatically. Provider/API access must be approved and integrated separately.

## 1. Create separate services
Use a new Supabase project and a new Render Web Service for SKY WAY. Do not reuse credentials or databases from other projects.

## 2. Supabase
Open the new Supabase project's SQL Editor and run `schema.sql`.

## 3. GitHub / Render
Upload these files to a new GitHub repository. Create a Render **Web Service** connected to that repository.
- Build Command: `npm install`
- Start Command: `npm start`
- Runtime: Node 22 or newer (Node 22 recommended)

Set these Render Environment Variables:
- `SUPABASE_URL` — Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key; secret, server-side only
- `ADMIN_API_KEY` — long, random private key
- `TELEGRAM_BOT_TOKEN` — bot token, secret
- `TELEGRAM_ADMIN_CHAT_ID` — Telegram user/group chat ID for admin notifications
- `BACKEND_URL` — deployed Render HTTPS URL, e.g. `https://your-service.onrender.com`

Do not put secrets in `public/admin.html`, GitHub, screenshots, or chat messages.

## 4. Check startup before anything else
After deploy, open `/health`. Expected JSON has `"ok": true` and `"service": "Sky Way Travel Agency"`.
If Render says "Application exited early", open Render → Logs and capture the **first error above** the exit line. The exit line itself is not the root cause.

## 5. Open admin
Visit the service root `/` and enter `ADMIN_API_KEY`. This simple shared-key login is a starter protection mechanism; before production use, replace it with proper user accounts, hashed passwords, roles, session cookies and rate limiting.

## 6. Test a request
Send POST `/api/requests` with JSON:
{
  "request_type":"flight",
  "customer_name":"Test Customer",
  "phone":"+251900000000",
  "origin":"Addis Ababa",
  "destination":"Guangzhou",
  "departure_date":"2026-12-01",
  "passengers":1,
  "details":"Example enquiry only"
}

Admin API endpoints use header `x-admin-api-key: YOUR_ADMIN_API_KEY`:
- `GET /api/admin/summary`
- `GET /api/admin/requests`
- `PATCH /api/admin/requests/:id`

Telegram webhook setup can be requested at `GET /api/telegram/setup` with the same admin header after `BACKEND_URL` is configured. The initial bot supports `/start` and `/help`; a customer-facing conversation flow is the next implementation stage.

## 7. Known next steps
1. Add proper customer-facing Telegram request flow and validation.
2. Add WhatsApp Business Platform after credentials/approval.
3. Add receipt upload to private Supabase Storage with file validation.
4. Add employee accounts and role permissions.
5. Integrate live flight/hotel supplier APIs only after approval and API documentation.
6. Add audit log, backups, rate limiting and production authentication.
