/**
 * Branded transactional email. Table layout + inline styles because email clients
 * (Gmail, Outlook) ignore most modern CSS. Same palette as the app.
 */
export interface EmailContent {
  preheader: string; // inbox preview line
  eyebrow: string;
  title: string;
  intro: string;
  status?: { label: string; tone: 'pending' | 'hod' | 'info' | 'approved' | 'rejected' | 'neutral' };
  rows?: [string, string][];
  quote?: { by: string; text: string };
  cta?: { label: string; url: string };
}

const TONES = {
  pending: ['#fff4e0', '#b26a00'],
  hod: ['#eee7fa', '#5c0fd9'],
  info: ['#e7f1fa', '#216ba5'],
  approved: ['#e6f4ed', '#1f8a5b'],
  rejected: ['#fbeae7', '#c2412d'],
  neutral: ['#f0eef4', '#6b6478'],
} as const;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderEmail(c: EmailContent): string {
  const font = "font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  // Status as a quiet labelled line with a coloured rule, not a pill badge.
  const status = c.status
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px"><tr><td style="border-left:3px solid ${TONES[c.status.tone][1]};padding:1px 0 1px 12px"><div style="font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#8a8496">Status</div><div style="font-size:14px;font-weight:600;color:${TONES[c.status.tone][1]};margin-top:2px">${esc(c.status.label)}</div></td></tr></table>`
    : '';
  const rows = (c.rows ?? [])
    .map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #efeaf6;color:#6b6478;font-size:13px;width:38%">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #efeaf6;color:#16121f;font-size:14px;font-weight:600">${esc(v)}</td></tr>`)
    .join('');
  const quote = c.quote
    ? `<div style="margin:20px 0 0;padding:14px 16px;border-left:3px solid #ff6300;background:#fff7f1;border-radius:0 10px 10px 0"><div style="font-size:12px;color:#6b6478;margin-bottom:4px">${esc(c.quote.by)} wrote</div><div style="font-size:15px;color:#16121f;line-height:1.5">“${esc(c.quote.text)}”</div></div>`
    : '';
  const cta = c.cta
    ? `<a href="${esc(c.cta.url)}" style="display:inline-block;margin-top:24px;padding:13px 22px;background:#5c0fd9;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">${esc(c.cta.label)}</a>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f1fa;${font}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1fa;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="background:#5c0fd9;border-radius:18px 18px 0 0;padding:22px 28px;position:relative">
    <table role="presentation" width="100%"><tr>
      <td><span style="display:inline-block;width:30px;height:30px;border-radius:8px;background:#ffffff;color:#ff6300;font-weight:900;font-size:18px;line-height:30px;text-align:center">V</span>
      <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.12em;vertical-align:middle;margin-left:8px">VISTA</span></td>
      <td align="right" style="color:#d9c8fb;font-size:12px">Leave, simplified</td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;background:linear-gradient(90deg,#ff6300,#ff9a4d);background-color:#ff6300"></td></tr>
  <tr><td style="background:#ffffff;padding:30px 28px 32px;border-radius:0 0 18px 18px;box-shadow:0 8px 28px rgba(60,20,140,.08)">
    <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6478">${esc(c.eyebrow)}</div>
    <h1 style="margin:8px 0 12px;font-size:24px;line-height:1.25;color:#16121f">${esc(c.title)}</h1>
    ${status}
    <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#3b3546">${esc(c.intro)}</p>
    ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px">${rows}</table>` : ''}
    ${quote}
    ${cta}
  </td></tr>
  <tr><td style="padding:18px 8px;text-align:center;font-size:12px;color:#8a8496;line-height:1.6">
    You're receiving this because of activity on your Vista leave account.<br>Vista · Hasta la vista, see you soon.
  </td></tr>
</table></td></tr></table></body></html>`;
}
