// Natluc Trading CRM — email selected documents to a customer
//
// Called directly by the frontend (Documents section of a customer's
// detail view) via supabaseClient.functions.invoke('send-documents', ...).
// Runs with the caller's own session — Supabase verifies the JWT at the
// gateway before this code runs, and every DB call below forwards that
// same token so Postgres RLS (not this function) decides what the caller
// is allowed to see or write.
//
// Reuses the RESEND_API_KEY / RESEND_FROM_EMAIL secrets already set up
// for the notify-task-assigned function — nothing new to configure.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
// FROM_EMAIL sends from the crm.natluctrading.co.za subdomain, which has no
// inbox behind it — replies need to land somewhere a human actually reads.
const REPLY_TO_EMAIL = Deno.env.get('RESEND_REPLY_TO') || 'riaan@natluctrading.co.za';

function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function emailFromJwt(authHeader: string | null): string {
  try {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.email || '';
  } catch {
    return '';
  }
}

// Called directly from the browser (unlike notify-task-assigned, which is
// only ever invoked server-side), so responses need CORS headers or the
// browser blocks the request before this code's own error handling ever runs.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set');
    return new Response('Server not configured', { status: 500, headers: corsHeaders });
  }

  let body: {
    document_ids?: string[];
    to_email?: string;
    to_name?: string;
    subject?: string;
    message?: string;
    customer_id?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
  }

  const { document_ids, to_email, to_name, subject, message, customer_id } = body;

  if (!to_email || !document_ids?.length) {
    return new Response('Missing to_email or document_ids', { status: 400, headers: corsHeaders });
  }

  const restHeaders = {
    apikey: SUPABASE_ANON_KEY!,
    Authorization: authHeader,
    'Content-Type': 'application/json',
  };

  const idsFilter = `in.(${document_ids.join(',')})`;
  const docsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?select=id,name,file_url,file_name,file_size,mime_type&id=${encodeURIComponent(idsFilter)}`,
    { headers: restHeaders },
  );
  if (!docsResp.ok) {
    console.error('documents lookup failed:', docsResp.status, await docsResp.text());
    return new Response('Could not look up documents', { status: 500, headers: corsHeaders });
  }
  const docs: { id: string; name: string; file_url: string; file_name: string; file_size: number | null; mime_type: string | null }[] = await docsResp.json();
  if (!docs.length) {
    return new Response('No matching documents found', { status: 400, headers: corsHeaders });
  }

  // Videos (and anything too big to attach) are linked in the email body
  // instead of attached — Resend caps total email size at 40MB, and large
  // attachments get stripped or bounced by most mail providers anyway.
  const LINK_THRESHOLD_BYTES = 8 * 1024 * 1024;
  const isLinkOnly = (d: typeof docs[number]) =>
    (d.mime_type || '').startsWith('video/') || (d.file_size ?? 0) > LINK_THRESHOLD_BYTES;

  const attachDocs = docs.filter(d => !isLinkOnly(d));
  const linkDocs = docs.filter(isLinkOnly);

  const emailSubject = subject?.trim() || 'Documents from Natluc Trading';
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <div style="background:#2A2A2C;padding:20px 24px;border-bottom:4px solid #EA9A21;">
        <img src="https://natluc.net/assets/natluc-logo.png" alt="Natluc Trading" height="28" style="display:block;height:28px;width:auto;"/>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 4px 0;">Hi ${escapeHtml(to_name || '')},</p>
        ${message ? `<p style="color:#58585A;white-space:pre-wrap;margin:0 0 14px 0;">${escapeHtml(message)}</p>` : ''}
        ${attachDocs.length ? `
          <p style="margin:0 0 6px 0;">Attached:</p>
          <ul style="font-size:13.5px;color:#58585A;padding-left:18px;margin:0 0 14px 0;">
            ${attachDocs.map(d => `<li>${escapeHtml(d.name)}</li>`).join('')}
          </ul>
        ` : ''}
        ${linkDocs.map(d => `
          <p style="margin:0 0 14px 0;">
            <a href="${d.file_url}" style="display:inline-block;background:#EA9A21;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:13.5px;">
              ▶ Watch: ${escapeHtml(d.name)}
            </a>
          </p>
        `).join('')}
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
      to: to_email,
      reply_to: REPLY_TO_EMAIL,
      subject: emailSubject,
      html,
      ...(attachDocs.length ? { attachments: attachDocs.map(d => ({ path: d.file_url, filename: d.file_name })) } : {}),
    }),
  });

  if (!resendResp.ok) {
    const errText = await resendResp.text();
    console.error('Resend API error:', resendResp.status, errText);
    return new Response(`Email send failed: ${errText}`, { status: 502, headers: corsHeaders });
  }

  const sentBy = emailFromJwt(authHeader);
  const logResp = await fetch(`${SUPABASE_URL}/rest/v1/document_sends`, {
    method: 'POST',
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify([{
      customer_id: customer_id || null,
      to_email,
      document_names: docs.map(d => d.name),
      subject: emailSubject,
      sent_by: sentBy,
    }]),
  });
  if (!logResp.ok) {
    console.error('document_sends log failed:', logResp.status, await logResp.text());
  }

  return new Response('OK', { status: 200, headers: corsHeaders });
});
