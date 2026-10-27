# Supabase Edge Functions

## send-email

Sends transactional emails via SMTP.

### Deploy

```bash
supabase functions deploy send-email
```

### Set secrets

```bash
supabase secrets set SMTP_HOST=smtp.gmail.com
supabase secrets set SMTP_PORT=587
supabase secrets set SMTP_USER=examoffice@youruni.edu
supabase secrets set SMTP_PASS=your_app_password
supabase secrets set SMTP_FROM="Exam Office <examoffice@youruni.edu>"
```

For Gmail, generate an App Password at: https://myaccount.google.com/apppasswords

### Test locally

```bash
supabase functions serve send-email
curl -X POST http://localhost:54321/functions/v1/send-email \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test","html":"<p>Hello</p>"}'
```
