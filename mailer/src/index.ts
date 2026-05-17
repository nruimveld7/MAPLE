import express, { type Request, type Response } from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';

type TemplateName = 'password_reset' | 'invite' | 'generic';
type EmailMode = 'console' | 'smtp';

type RenderedTemplate = {
  subject: string;
  text: string;
  html: string;
};

const PORT = Number(process.env.PORT || 3000);
const EMAIL_MODE: EmailMode = process.env.EMAIL_MODE === 'smtp' ? 'smtp' : 'console';
const APP_BRAND = (process.env.APP_BRAND || 'MAPLE').trim();
const EMAIL_FROM = process.env.EMAIL_FROM || (APP_BRAND + ' <your-mailer-account@example.com>');
const INTERNAL_API_KEY = (process.env.MAILER_INTERNAL_API_KEY || '').trim();

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || 'your-mailer-account@example.com';
const SMTP_PASS = process.env.SMTP_PASS || '';

const app = express();
app.use(express.json({ limit: '100kb' }));

const sendTemplateSchema = z.object({
  template: z.enum(['password_reset', 'invite', 'generic']),
  to: z.string().email().max(320),
  from: z.string().min(1).max(320).optional(),
  data: z.record(z.unknown())
});

const passwordResetDataSchema = z.object({
  resetUrl: z.string().url().min(1)
});

const inviteDataSchema = z.object({
  inviteUrl: z.string().url().min(1)
});

const genericDataSchema = z.object({
  subject: z.string().min(1).max(250),
  text: z.string().min(1).max(20000),
  html: z.string().max(50000).optional()
});

const transport = EMAIL_MODE === 'smtp'
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    })
  : null;

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const sensitiveKeys = ['token', 'code', 'key', 'secret'];
    for (const key of sensitiveKeys) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return '[INVALID_URL]';
  }
}

function renderTemplate(template: TemplateName, data: Record<string, unknown>): RenderedTemplate {
  if (template === 'password_reset') {
    const parsed = passwordResetDataSchema.parse(data);
    return {
      subject: 'Reset your ' + APP_BRAND + ' password',
      text: [
        'We received a request to reset your password.',
        '',
        `Reset link: ${parsed.resetUrl}`,
        '',
        'If you did not request this, you can ignore this email.'
      ].join('\n'),
      html: [
        '<p>We received a request to reset your password.</p>',
        `<p><a href="${parsed.resetUrl}">Reset your password</a></p>`,
        '<p>If you did not request this, you can ignore this email.</p>'
      ].join(''),
    };
  }

  if (template === 'invite') {
    const parsed = inviteDataSchema.parse(data);
    return {
      subject: 'Your ' + APP_BRAND + ' invitation',
      text: [
        'You were invited to join ' + APP_BRAND + '.',
        '',
        `Accept invite: ${parsed.inviteUrl}`,
        '',
        'If this was unexpected, you can ignore this email.'
      ].join('\n'),
      html: [
        '<p>You were invited to join ' + APP_BRAND + '.</p>',
        `<p><a href="${parsed.inviteUrl}">Accept your invitation</a></p>`,
        '<p>If this was unexpected, you can ignore this email.</p>'
      ].join(''),
    };
  }

  const parsed = genericDataSchema.parse(data);
  return {
    subject: parsed.subject,
    text: parsed.text,
    html: parsed.html || `<pre style="font-family: sans-serif; white-space: pre-wrap;">${parsed.text}</pre>`
  };
}

type RateBucket = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateBucket>();

function buildRateLimitKey(template: TemplateName, to: string): string {
  return `${template.toLowerCase()}::${to.trim().toLowerCase()}`;
}

function getRateWindowMs(template: TemplateName): number {
  if (template === 'password_reset') return 15 * 60 * 1000;
  return 10 * 60 * 1000;
}

function getRateLimitMax(template: TemplateName): number {
  if (template === 'password_reset') return 3;
  return 10;
}

function enforceRateLimit(template: TemplateName, to: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const key = buildRateLimitKey(template, to);
  const windowMs = getRateWindowMs(template);
  const max = getRateLimitMax(template);

  const bucket = rateLimitMap.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  bucket.count += 1;
  return { ok: true };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now >= value.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000).unref();

function hasValidBearerAuth(req: Request): boolean {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;
  const token = header.slice('Bearer '.length).trim();
  return Boolean(INTERNAL_API_KEY) && token === INTERNAL_API_KEY;
}

function logSend(event: {
  template: TemplateName;
  to: string;
  ok: boolean;
  mode: EmailMode;
  error?: string;
}) {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    service: 'mailer',
    template: event.template,
    to: event.to,
    ok: event.ok,
    mode: event.mode
  };

  if (event.error) {
    payload.error = event.error;
  }
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'mailer' });
});

app.post('/send/template', async (req: Request, res: Response) => {
  if (!hasValidBearerAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsedBody = sendTemplateSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const { template, to, from, data } = parsedBody.data;
  const effectiveFrom = from?.trim() || EMAIL_FROM;

  const rate = enforceRateLimit(template, to);
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  let rendered: RenderedTemplate;
  try {
    rendered = renderTemplate(template, data);
  } catch {
    return res.status(400).json({ error: 'Template data is invalid' });
  }

  try {
    if (EMAIL_MODE !== 'console') {
      if (!transport) {
        throw new Error('SMTP transport is not initialized');
      }

      await transport.sendMail({
        from: effectiveFrom,
        to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html
      });
    }

    logSend({ template, to, ok: true, mode: EMAIL_MODE });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send_failed';
    logSend({ template, to, ok: false, mode: EMAIL_MODE, error: message.slice(0, 200) });
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

if (!INTERNAL_API_KEY) {
}

if (EMAIL_MODE === 'smtp' && !SMTP_PASS) {
}

app.listen(PORT, '0.0.0.0', () => {
});
