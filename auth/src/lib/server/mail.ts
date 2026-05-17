import { sendGenericEmail } from '$lib/server/mailerClient';

export type MailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail(input: MailInput): Promise<void> {
  await sendGenericEmail(input.to, input.subject, input.text);
}
