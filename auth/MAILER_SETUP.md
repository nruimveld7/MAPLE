# Mailer Setup

This app sends emails through the internal mailer HTTP service.

## Required environment variables

- `MAILER_URL=http://mailer:3000`
- `MAILER_INTERNAL_API_KEY=<shared-internal-key>`

## Request contract used by the app

- `POST ${MAILER_URL}/send/template`
- Header: `Authorization: Bearer ${MAILER_INTERNAL_API_KEY}`
- Header: `Content-Type: application/json`

## Current usage in this app

- Temporary password emails use reusable branded HTML + plain text templates via:
  - `sendTemporaryPasswordEmail(to, temporaryPassword)`
- Invite emails can use the same reusable branded style via:
  - `sendInviteTemplateEmail(to, inviteUrl)`

Both helpers are defined in:

- `src/lib/server/emailTemplates.ts`

Low-level mailer API helpers are defined in:

- `src/lib/server/mailerClient.ts`

