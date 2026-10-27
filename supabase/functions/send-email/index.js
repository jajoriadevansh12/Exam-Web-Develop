/**
 * Supabase Edge Function: send-email
 * 
 * Receives { to, subject, html } and sends via SMTP using nodemailer.
 * Deploy with: supabase functions deploy send-email
 * 
 * Set secrets:
 *   supabase secrets set SMTP_HOST=smtp.gmail.com
 *   supabase secrets set SMTP_PORT=587
 *   supabase secrets set SMTP_USER=youruser@gmail.com
 *   supabase secrets set SMTP_PASS=your_app_password
 *   supabase secrets set SMTP_FROM=examoffice@university.edu
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "Missing to, subject, or html" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
    const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") ?? "587");
    const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
    const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
    const SMTP_FROM = Deno.env.get("SMTP_FROM") ?? SMTP_USER;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return new Response(JSON.stringify({ error: "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS secrets." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use Deno's built-in SMTP client
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: SMTP_PORT === 465,
        auth: { username: SMTP_USER, password: SMTP_PASS },
      },
    });

    await client.send({
      from: SMTP_FROM,
      to,
      subject,
      html,
    });

    await client.close();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
