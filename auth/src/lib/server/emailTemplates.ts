import { sendGenericEmail } from '$lib/server/mailerClient';
import { getAppBrandName } from '$lib/server/branding';
import { getPublicAppOrigin } from '$lib/server/publicAppUrl';

const APP_NAME = getAppBrandName();
const APP_BASE_URL = getPublicAppOrigin();
const BRAND_PRIMARY = '#58a6ff';
const BRAND_SECONDARY = '#a855f7';

type EmailTemplateInput = {
	subject: string;
	preheader: string;
	title: string;
	intro: string;
	ctaLabel?: string;
	ctaUrl?: string;
	footerNote?: string;
};

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function renderLayout(input: EmailTemplateInput): string {
	const ctaHtml =
		input.ctaLabel && input.ctaUrl
			? `
				<tr>
					<td style="padding: 0 32px 24px 32px;">
						<a
							href="${escapeHtml(input.ctaUrl)}"
							style="display:inline-block;padding:12px 18px;border-radius:10px;background:linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY});color:#ffffff;font:600 14px Arial,sans-serif;text-decoration:none;"
						>
							${escapeHtml(input.ctaLabel)}
						</a>
					</td>
				</tr>
			`
			: '';

	const footer = input.footerNote
		? `<p style="margin:0;color:#8b949e;font:400 12px/1.6 Arial,sans-serif;">${escapeHtml(input.footerNote)}</p>`
		: '';

	return `
<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width,initial-scale=1" />
		<title>${escapeHtml(input.subject)}</title>
	</head>
	<body style="margin:0;padding:24px;background:#06080c;">
		<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
			${escapeHtml(input.preheader)}
		</div>
		<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;border-collapse:collapse;">
			<tr>
				<td style="padding:0 0 16px 0;color:#f0f6fc;font:700 16px Arial,sans-serif;">
					${APP_NAME}
				</td>
			</tr>
			<tr>
				<td style="background:#0d1117;border:1px solid #30363d;border-radius:16px;overflow:hidden;">
					<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
						<tr>
							<td style="height:4px;background:linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY});font-size:0;line-height:0;">&nbsp;</td>
						</tr>
						<tr>
							<td style="padding:28px 32px 10px 32px;color:#f0f6fc;font:700 24px/1.2 Arial,sans-serif;">
								${escapeHtml(input.title)}
							</td>
						</tr>
						<tr>
							<td style="padding:0 32px 24px 32px;color:#c9d1d9;font:400 15px/1.7 Arial,sans-serif;">
								${escapeHtml(input.intro)}
							</td>
						</tr>
						${ctaHtml}
						<tr>
							<td style="padding:0 32px 28px 32px;">
								${footer}
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
`.trim();
}

function passwordResetText(temporaryPassword: string): string {
	return [
		'We received a request to issue a temporary password for your account.',
		'',
		`Temporary password: ${temporaryPassword}`,
		'',
		'This temporary password expires in 1 hour and can be used only once.',
		'Sign in and then update your password from Account settings.'
	].join('\n');
}

function inviteText(inviteUrl: string, inviteCode: string): string {
	return [
		`You have been invited to ${APP_NAME}.`,
		'',
		`Invite code: ${inviteCode}`,
		'',
		`Accept your invite: ${inviteUrl}`,
		'',
		'If you did not expect this invitation, you can ignore this message.'
	].join('\n');
}

export async function sendTemporaryPasswordEmail(
	to: string,
	temporaryPassword: string
): Promise<void> {
	const subject = `Your ${APP_NAME} temporary password`;
	const text = passwordResetText(temporaryPassword);
	const html = renderLayout({
		subject,
		preheader: 'Use this temporary password to sign in.',
		title: 'Temporary password issued',
		intro: `Use this temporary password to sign in: ${temporaryPassword}. This code expires in 1 hour and is valid for one sign-in only.`,
		ctaLabel: `Sign in to ${APP_NAME}`,
		ctaUrl: `${APP_BASE_URL}/auth/login`,
		footerNote: 'If you did not request this, you can ignore this email.'
	});

	await sendGenericEmail(to, subject, text, html);
}

export async function sendInviteTemplateEmail(
	to: string,
	inviteUrl: string,
	inviteCode: string
): Promise<void> {
	const subject = `You are invited to ${APP_NAME}`;
	const text = inviteText(inviteUrl, inviteCode);
	const html = renderLayout({
		subject,
		preheader: `You have a new ${APP_NAME} invite.`,
		title: 'You are invited',
		intro: `Your account invite is ready. Your invite code is ${inviteCode}. Use the button below to open sign in/sign up and complete setup.`,
		ctaLabel: 'Accept invite',
		ctaUrl: inviteUrl,
		footerNote: 'If this invite was unexpected, you can ignore this email.'
	});

	await sendGenericEmail(to, subject, text, html);
}
