import { env } from '$env/dynamic/private';

const DEFAULT_MAILER_URL = 'http://mailer:3000';

function getMailerUrl() {
	return (env.MAILER_URL || DEFAULT_MAILER_URL).replace(/\/$/, '');
}

function getMailerApiKey() {
	return (env.MAILER_INTERNAL_API_KEY || '').trim();
}

export async function sendGenericEmail(to, subject, text, html) {
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
		body: JSON.stringify({
			template: 'generic',
			to,
			data: {
				subject,
				text,
				html
			}
		})
	});

	if (!response.ok) {
		throw new Error(`Mailer request failed with status ${response.status}`);
	}
}
