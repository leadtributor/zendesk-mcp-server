import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { oauthRouter } from './oauth/routes.js';
import { verifyToken } from './oauth/jwt.js';
import { getBaseUrl } from './base-url.js';

const app = express();
app.use(cors({
  exposedHeaders: ['WWW-Authenticate', 'MCP-Session-Id'],
}));
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const SESSION_IDLE_MS = parseInt(process.env.SESSION_IDLE_TIMEOUT_MS ?? '1800000', 10); // 30 min

// ── Session management ────────────────────────────────────────────────────────

interface Session {
  transport: StreamableHTTPServerTransport;
  timer: NodeJS.Timeout;
}

const sessions = new Map<string, Session>();

function registerSession(id: string, transport: StreamableHTTPServerTransport): void {
  const timer = setTimeout(() => expireSession(id), SESSION_IDLE_MS);
  sessions.set(id, { transport, timer });
}

function touchSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = setTimeout(() => expireSession(id), SESSION_IDLE_MS);
}

function removeSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  clearTimeout(session.timer);
  sessions.delete(id);
}

function expireSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  session.transport.close().catch(() => {});
}

// ── Middleware ────────────────────────────────────────────────────────────────

if (process.env.LOG_REQUESTS === 'true') {
  app.use((req, _res, next) => {
    const auth = req.headers['authorization'];
    const safeHeaders = {
      ...req.headers,
      ...(auth ? { authorization: auth.slice(0, 15) + '…' } : {}),
    };
    console.log(`${req.method} ${req.path} | headers: ${JSON.stringify(safeHeaders)}`);
    next();
  });
}

app.use(oauthRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function extractCredentials(req: express.Request) {
  const auth = req.headers['authorization'];
  const bearerToken = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  return bearerToken ? verifyToken(bearerToken) : null;
}

function unauthorizedResponse(req: express.Request, res: express.Response): void {
  const base = getBaseUrl(req);
  res.status(401)
    .set('WWW-Authenticate', `Bearer realm="${base}", resource_metadata_url="${base}/.well-known/oauth-protected-resource"`)
    .json({ error: 'unauthorized', message: 'Valid Bearer token required.' });
}

// ── MCP endpoints ─────────────────────────────────────────────────────────────

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    touchSession(sessionId);
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  const credentials = await extractCredentials(req);
  if (!credentials) {
    unauthorizedResponse(req, res);
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      registerSession(id, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      removeSession(transport.sessionId);
    }
  };

  const mcpServer = createServer(credentials);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }
  touchSession(sessionId!);
  await session.transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }
  await session.transport.handleRequest(req, res);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', activeSessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`Zendesk MCP Server listening on port ${PORT}`);
});
