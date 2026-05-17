import crypto from 'node:crypto';

export function normalizeInviteCode(value: string): string {
	return value.trim().toUpperCase();
}

export function hashInviteCode(code: string): string {
	return crypto.createHash('sha256').update(normalizeInviteCode(code)).digest('hex');
}

export function generateInviteCode(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let code = '';
	for (let i = 0; i < 8; i += 1) {
		const idx = crypto.randomInt(0, chars.length);
		code += chars[idx];
	}
	return code;
}
