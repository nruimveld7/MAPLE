import { env } from '$env/dynamic/private';

const DEFAULT_MAILER_URL = 'http://mailer:3000';

type TemplatePayload =
  | {
      template: 'password_reset';
      to: string;
      from?: string;
      data: { resetUrl: string };
    }
  | {
      template: 'invite';
      to: string;
      from?: string;
      data: { inviteUrl: string };
    }
  | {
      template: 'generic';
      to: string;
      from?: string;
      data: { subject: string; text: string; html?: string };
    };

function getMailerUrl(): string {
  return (env.MAILER_URL || DEFAULT_MAILER_URL).replace(/\/$/, '');
}

function getMailerApiKey(): string {
  return (env.MAILER_INTERNAL_API_KEY || '').trim();
}

async function sendTemplateEmail(payload: TemplatePayload): Promise<void> {
  const apiKey = getMailerApiKey();
  if (!apiKey) {
    throw new Error('MAILER_INTERNAL_API_KEY is not configured.');
  }

  const response = await fetch(`${getMailerUrl()}/send/template`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Mailer request failed with status ${response.status}`);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, from?: string): Promise<void> {
  await sendTemplateEmail({
    template: 'password_reset',
    to,
    from,
    data: { resetUrl }
  });
}

export async function sendInviteEmail(to: string, inviteUrl: string, from?: string): Promise<void> {
  await sendTemplateEmail({
    template: 'invite',
    to,
    from,
    data: { inviteUrl }
  });
}

export async function sendGenericEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  from?: string
): Promise<void> {
  await sendTemplateEmail({
    template: 'generic',
    to,
    from,
    data: { subject, text, html }
  });
}
