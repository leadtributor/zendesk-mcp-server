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

// Active sessions: MCP-Session-Id -> transport
const sessions = new Map<string, StreamableHTTPServerTransport>();

// Request logging
if (process.env.LOG_REQUESTS === 'true') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path} | headers: ${JSON.stringify(req.headers)}`);
    next();
  });
}

// OAuth endpoints
app.use(oauthRouter);

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

// New connection or tool call on existing session
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // New session: validate Bearer token
  const credentials = await extractCredentials(req);
  if (!credentials) {
    unauthorizedResponse(req, res);
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
    }
  };

  const mcpServer = createServer(credentials);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// SSE stream for server-sent notifications
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const transport = sessionId ? sessions.get(sessionId) : undefined;
  if (!transport) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }
  await transport.handleRequest(req, res);
});

// Session termination
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const transport = sessionId ? sessions.get(sessionId) : undefined;
  if (!transport) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }
  await transport.handleRequest(req, res);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', activeSessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`Zendesk MCP Server listening on port ${PORT}`);
});
