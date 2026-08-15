// Natluc Trading CRM — task assignment email notification
//
// Triggered by a Postgres trigger (see notify_task_assigned.sql) on every
// INSERT into `tasks`. The trigger does the DB lookups (assignee name,
// customer name, who created it) and posts the finished payload here — this
// function's only job is to turn that into an email via Resend.
//
// Never called directly by the frontend; authenticated by a shared secret
// (TASK_NOTIFY_SECRET) the trigger sends in the `x-webhook-secret` header,
// since it's invoked from inside the database, not by a logged-in user.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const TASK_NOTIFY_SECRET = Deno.env.get('TASK_NOTIFY_SECRET');
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!TASK_NOTIFY_SECRET || req.headers.get('x-webhook-secret') !== TASK_NOTIFY_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set');
    return new Response('Server not configured', { status: 500 });
  }

  let body: {
    assignee_name?: string;
    assignee_email?: string;
    title?: string;
    description?: string | null;
    due_date?: string | null;
    customer_name?: string | null;
    created_by_name?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { assignee_name, assignee_email, title, description, due_date, customer_name, created_by_name } = body;

  if (!assignee_email || !title) {
    return new Response('Missing assignee_email or title', { status: 400 });
  }

  const rows = [
    due_date ? `<tr><td style="padding:4px 12px 4px 0;color:#8B8681;">Due</td><td>${escapeHtml(due_date)}</td></tr>` : '',
    customer_name ? `<tr><td style="padding:4px 12px 4px 0;color:#8B8681;">Customer</td><td>${escapeHtml(customer_name)}</td></tr>` : '',
    created_by_name ? `<tr><td style="padding:4px 12px 4px 0;color:#8B8681;">Assigned by</td><td>${escapeHtml(created_by_name)}</td></tr>` : '',
  ].filter(Boolean).join('');

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <div style="background:#2A2A2C;padding:20px 24px;border-bottom:4px solid #EA9A21;">
        <h1 style="color:#fff;font-size:18px;margin:0;">Natluc Trading CRM</h1>
        <div style="color:#EA9A21;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:2px;">New task assigned</div>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 4px 0;">Hi ${escapeHtml(assignee_name || '')},</p>
        <p style="margin:0 0 16px 0;">A new task has been assigned to you:</p>
        <h2 style="font-size:16px;margin:0 0 10px 0;">${escapeHtml(title)}</h2>
        ${description ? `<p style="color:#58585A;white-space:pre-wrap;margin:0 0 14px 0;">${escapeHtml(description)}</p>` : ''}
        ${rows ? `<table style="font-size:13.5px;border-collapse:collapse;">${rows}</table>` : ''}
        <p style="margin-top:22px;font-size:12.5px;color:#8B8681;">Log in to the CRM to view or complete this task.</p>
      </div>
    </div>
  `;

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: assignee_email,
      subject: `New task: ${title}`,
      html,
    }),
  });

  if (!resendResp.ok) {
    const errText = await resendResp.text();
    console.error('Resend API error:', resendResp.status, errText);
    return new Response(`Email send failed: ${errText}`, { status: 502 });
  }

  return new Response('OK', { status: 200 });
});
