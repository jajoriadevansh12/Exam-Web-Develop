/**
 * email.js — Client-side email dispatch via Supabase Edge Function
 * 
 * The heavy lifting (SMTP connection) happens in a Supabase Edge Function.
 * This module calls that function with the email payload.
 * 
 * Alternatively, if you want zero server code, you can use EmailJS or
 * a transactional API (Resend, SendGrid) directly from the browser.
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Send a duty assignment notification email to a professor.
 * @param {{ professorName:string, professorEmail:string, examName:string,
 *           examDate:string, session:string, roomBlock:string, roomNumber:string,
 *           universityName:string }} duty
 */
export async function sendDutyEmail(duty) {
  const subject = `Exam Duty Assignment — ${duty.examName} (${duty.examDate})`;
  const body = buildDutyEmailHtml(duty);

  return callEmailFunction({ to: duty.professorEmail, subject, html: body });
}

/**
 * Send a bulk duty summary Excel attachment to all assigned professors.
 * Instead of attaching the file, we email a plain-text summary with all duties
 * listed so professors see their full schedule.
 * @param {Array<{professorEmail:string, professorName:string, duties:Array}>} professorDuties
 * @param {string} examName
 * @param {string} universityName
 */
export async function sendBulkDutySummary(professorDuties, examName, universityName) {
  const results = [];
  for (const pd of professorDuties) {
    const subject = `Duty Schedule — ${examName}`;
    const body = buildSummaryEmailHtml(pd, examName, universityName);
    const result = await callEmailFunction({
      to: pd.professorEmail,
      subject,
      html: body,
    });
    results.push({ email: pd.professorEmail, ok: result.ok, error: result.error });
  }
  return results;
}

async function callEmailFunction(payload) {
  // Try Supabase Edge Function first
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: payload,
    });
    if (error) throw error;
    return { ok: true, data };
  } catch (err) {
    // Fallback: try window.fetch to a self-hosted relay if configured
    const relayUrl = import.meta.env.VITE_EMAIL_RELAY_URL;
    if (relayUrl) {
      const res = await fetch(relayUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: await res.text() };
      return { ok: true };
    }
    console.error("Email send failed (no relay configured):", err);
    return { ok: false, error: err?.message ?? "Email not configured" };
  }
}

function buildDutyEmailHtml({ professorName, examName, examDate, session, roomBlock, roomNumber, universityName }) {
  const sessionLabel = session.charAt(0).toUpperCase() + session.slice(1);
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #222; background: #f5f5f5; margin: 0; padding: 20px; }
  .card { background: #fff; border-radius: 8px; max-width: 520px; margin: 0 auto; padding: 32px; border: 1px solid #e0e0e0; }
  h2 { color: #1a1a2e; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
  td:first-child { color: #666; width: 140px; font-weight: 600; }
  .footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; }
  .badge { display: inline-block; background: #e8f4fd; color: #1565c0; border-radius: 4px; padding: 2px 10px; font-size: 13px; font-weight: 600; }
</style>
</head>
<body>
<div class="card">
  <h2>📋 Exam Duty Assignment</h2>
  <p>Dear <strong>${professorName}</strong>,</p>
  <p>You have been assigned as an invigilator for the upcoming examination. Please find the details below:</p>
  <table>
    <tr><td>Examination</td><td><strong>${examName}</strong></td></tr>
    <tr><td>Date</td><td>${examDate}</td></tr>
    <tr><td>Session</td><td><span class="badge">${sessionLabel}</span></td></tr>
    <tr><td>Room</td><td><strong>${roomBlock} / ${roomNumber}</strong></td></tr>
  </table>
  <p>Kindly be present at the examination hall <strong>15 minutes before</strong> the session begins.</p>
  <p>If you are unable to attend due to unavoidable circumstances, please notify the Exam Office immediately.</p>
  <div class="footer">
    <p>— ${universityName} · Examination Branch</p>
    <p style="font-size:11px">This is an automated notification. Please do not reply to this email.</p>
  </div>
</div>
</body>
</html>`;
}

function buildSummaryEmailHtml({ professorName, duties }, examName, universityName) {
  const rows = duties.map((d) => `
    <tr>
      <td>${d.exam_date ?? "—"}</td>
      <td>${d.session ?? "—"}</td>
      <td>${d.room ?? "—"}</td>
      <td>${d.exam_name ?? "—"}</td>
    </tr>`).join("");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #222; background: #f5f5f5; margin: 0; padding: 20px; }
  .card { background: #fff; border-radius: 8px; max-width: 640px; margin: 0 auto; padding: 32px; border: 1px solid #e0e0e0; }
  h2 { color: #1a1a2e; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
  th { background: #f0f4ff; text-align: left; padding: 8px 10px; font-weight: 600; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  .footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; }
</style>
</head>
<body>
<div class="card">
  <h2>📅 Duty Schedule — ${examName}</h2>
  <p>Dear <strong>${professorName}</strong>, here is your complete duty schedule:</p>
  <table>
    <thead><tr><th>Date</th><th>Session</th><th>Room</th><th>Examination</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p>Please report 15 minutes before each session. For leave requests, contact the Exam Office.</p>
  <div class="footer"><p>— ${universityName} · Examination Branch</p></div>
</div>
</body>
</html>`;
}
