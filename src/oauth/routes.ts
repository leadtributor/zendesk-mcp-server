import express from 'express';
import { createHash, randomBytes } from 'crypto';
import { storeCode, consumeCode } from './store.js';
import { createToken } from './jwt.js';
import { getBaseUrl } from '../base-url.js';

export const oauthRouter = express.Router();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Protected Resource Metadata (RFC 9728) — first discovery step for MCP clients
oauthRouter.get('/.well-known/oauth-protected-resource', (req, res) => {
  const base = getBaseUrl(req);
  res.set('Cache-Control', 'no-store').json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: [],
  });
});

// Authorization Server Metadata (RFC 8414)
oauthRouter.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = getBaseUrl(req);
  res.set('Cache-Control', 'no-store').json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
});

// Dynamic Client Registration (RFC 7591) — accept any client
oauthRouter.post('/register', express.json(), (req, res) => {
  res.status(201).json({
    client_id: randomBytes(16).toString('hex'),
    client_secret_expires_at: 0,
    redirect_uris: (req.body as { redirect_uris?: string[] })?.redirect_uris ?? [],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  });
});

// Authorization endpoint — show Zendesk credential form
oauthRouter.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } =
    req.query as Record<string, string>;

  if (response_type !== 'code') {
    res.status(400).send('Unsupported response_type');
    return;
  }

  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zendesk MCP Server</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
    .card { background: white; border-radius: 16px; padding: 40px; width: 100%; max-width: 440px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .logo { font-size: 1.5rem; font-weight: 700; color: #111; margin-bottom: 6px; }
    .sub { font-size: 0.875rem; color: #666; margin-bottom: 32px; line-height: 1.5; }
    label { display: block; font-size: 0.8125rem; font-weight: 600; color: #333; margin-bottom: 6px; }
    input[type=text], input[type=email], input[type=password] {
      width: 100%; padding: 10px 14px; border: 1.5px solid #e0e0e0; border-radius: 8px;
      font-size: 0.875rem; margin-bottom: 6px; outline: none; transition: border-color 0.15s;
      font-family: inherit;
    }
    input:focus { border-color: #0066cc; }
    .hint { font-size: 0.75rem; color: #999; margin-bottom: 20px; }
    button { width: 100%; padding: 12px; background: #0066cc; color: white; border: none; border-radius: 8px; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: background 0.15s; margin-top: 8px; font-family: inherit; }
    button:hover { background: #0052a3; }
    .divider { border: none; border-top: 1px solid #f0f0f0; margin: 24px 0; }
    .security { font-size: 0.75rem; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Zendesk MCP Server</div>
    <p class="sub">Gib deine Zendesk-Zugangsdaten ein, um Claude Zugriff auf dein Help Center zu geben. Die Zugangsdaten werden verschlüsselt im Token gespeichert und nie auf dem Server abgelegt.</p>
    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(client_id ?? '')}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri ?? '')}">
      <input type="hidden" name="state" value="${escapeHtml(state ?? '')}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge ?? '')}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method ?? 'S256')}">

      <label for="subdomain">Zendesk Subdomain</label>
      <input type="text" id="subdomain" name="subdomain" placeholder="meinefirma" required autocomplete="off" spellcheck="false">
      <div class="hint">Aus der URL: <strong>meinefirma</strong>.zendesk.com</div>

      <label for="email">E-Mail-Adresse</label>
      <input type="email" id="email" name="email" placeholder="name@beispiel.de" required autocomplete="email">
      <div class="hint" style="margin-bottom:20px"></div>

      <label for="token">API-Token</label>
      <input type="password" id="token" name="token" placeholder="Zendesk API-Token" required autocomplete="off">
      <div class="hint">Unter Zendesk → Admin → Apps &amp; Integrationen → API → API-Token generieren.</div>

      <button type="submit">Zugriff erlauben</button>
    </form>
    <hr class="divider">
    <p class="security">🔒 Deine Zugangsdaten verlassen diesen Server nicht.</p>
  </div>
</body>
</html>`);
});

// Handle form submission → issue auth code
oauthRouter.post(
  '/authorize',
  express.urlencoded({ extended: false }),
  (req, res) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, subdomain, email, token } =
      req.body as Record<string, string>;

    if (!subdomain || !email || !token || !redirect_uri) {
      res.status(400).send('Fehlende Pflichtfelder.');
      return;
    }

    const code = randomBytes(32).toString('hex');
    storeCode(code, {
      credentials: { subdomain: subdomain.trim(), email: email.trim(), token: token.trim() },
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method ?? 'S256',
      redirectUri: redirect_uri,
      clientId: client_id,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);

    res.redirect(redirectUrl.toString());
  },
);

// Token endpoint — exchange code for access token
oauthRouter.post('/token', express.urlencoded({ extended: false }), express.json(), async (req, res) => {
  const { grant_type, code, redirect_uri, code_verifier } = req.body as Record<string, string>;

  if (grant_type !== 'authorization_code') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  const stored = consumeCode(code);
  if (!stored || stored.expiresAt < Date.now()) {
    res.status(400).json({ error: 'invalid_grant' });
    return;
  }

  if (stored.redirectUri !== redirect_uri) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    return;
  }

  // PKCE validation
  if (stored.codeChallenge) {
    if (!code_verifier) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Missing code_verifier' });
      return;
    }
    const challenge = createHash('sha256').update(code_verifier).digest('base64url');
    if (challenge !== stored.codeChallenge) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      return;
    }
  }

  res.json({
    access_token: await createToken(stored.credentials),
    token_type: 'bearer',
    expires_in: 28800,
  });
});
