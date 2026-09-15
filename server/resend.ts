import { Resend } from 'resend';

// Plain env-var based Resend client — replaces the old Replit Connector
// lookup (REPLIT_CONNECTORS_HOSTNAME / REPL_IDENTITY), which only works
// inside a Replit repl/deployment and throws on Render.
//
// Required env vars:
//   RESEND_API_KEY   - from https://resend.com/api-keys
//   RESEND_FROM_EMAIL - a sender address verified on your Resend domain
//                        (falls back to Resend's shared onboarding address
//                        if unset, which only works for testing)
//
// Kept as an async function (and the original export name) so existing
// call sites don't need to change.
export async function getUncachableResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set');
  }
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}
