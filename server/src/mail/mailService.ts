import { Resend } from 'resend';
import { renderEmail, type EmailContent } from './template.js';

let client: Resend | null = null;

/**
 * Demo accounts use Clerk test addresses (+clerk_test@ / @vista-demo.com) that cannot
 * receive mail, so we skip them. Real addresses get real email.
 */
export function isDemoAddress(email: string) {
  return /\+clerk_test@/i.test(email) || /@vista-demo\.com$/i.test(email);
}

export function appUrl(path = '') {
  const base = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:5173');
  return base.replace(/\/$/, '') + path;
}

/** Never throws: an email failure must not fail the leave action itself. */
export async function sendEmail(to: string | null | undefined, subject: string, content: EmailContent) {
  if (!to || process.env.NODE_ENV === 'test') return { skipped: 'test-or-no-recipient' };
  if (isDemoAddress(to)) {
    console.log(`✉︎ skipped (demo address) → ${to}: ${subject}`);
    return { skipped: 'demo-address' };
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`✉︎ skipped (RESEND_API_KEY not set) → ${to}: ${subject}`);
    return { skipped: 'not-configured' };
  }
  client ??= new Resend(key);
  try {
    const { error } = await client.emails.send({
      from: process.env.EMAIL_FROM ?? 'Vista <onboarding@resend.dev>',
      to,
      subject,
      html: renderEmail(content),
    });
    if (error) console.error('✉︎ Resend error:', error.message);
    else console.log(`✉︎ sent → ${to}: ${subject}`);
    return { sent: !error };
  } catch (err) {
    console.error('✉︎ email failed:', (err as Error).message);
    return { sent: false };
  }
}
