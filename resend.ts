import { Resend } from 'resend';

let connectionSettings: any;

// Plain environment variables work on any host (Render, etc). This is
// checked first so non-Replit deployments never touch the Replit-only path.
function getCredentialsFromEnv(): { apiKey: string; fromEmail: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    return null;
  }
  if (!fromEmail) {
    throw new Error('RESEND_FROM_EMAIL is not set (required alongside RESEND_API_KEY)');
  }
  return { apiKey, fromEmail };
}

// Replit-only path: pulls the key from Replit's connector service using
// Replit-specific auth tokens. Only reachable when those tokens exist.
async function getCredentialsFromReplitConnector() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

async function getCredentials() {
  const envCredentials = getCredentialsFromEnv();
  if (envCredentials) {
    return envCredentials;
  }
  return getCredentialsFromReplitConnector();
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableResendClient() {
  const credentials = await getCredentials();
  return {
    client: new Resend(credentials.apiKey),
    fromEmail: credentials.fromEmail
  };
}
