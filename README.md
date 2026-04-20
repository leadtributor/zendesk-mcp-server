# Zendesk MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI assistants (Claude.ai, Claude Desktop, etc.) access to the Zendesk Help Center API.

Users authenticate via an OAuth 2.0 form where they enter their Zendesk credentials. The credentials are encrypted in a short-lived JWE token (AES-256-GCM) and never stored on the server.

## Features

- OAuth 2.0 Authorization Code Flow with PKCE (RFC 7636)
- Dynamic Client Registration (RFC 7591)
- Credentials encrypted in JWE tokens — no server-side credential storage
- MCP tools for articles, sections, and categories (list, get, create, update, delete, search, translations)
- Session management with configurable idle timeout
- Stateless, horizontally scalable

## Quick Start

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET to a random 64-char hex string
npm install
npm run dev
```

The server starts on `http://localhost:3000`. Add it to a MCP client by pointing to `http://localhost:3000/mcp`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | *(random, changes on restart)* | Secret used to derive the AES-256-GCM encryption key for JWE tokens. Must be a stable, random string (e.g. 64 hex chars). If unset, a random key is generated at startup — all tokens become invalid on restart. |
| `PORT` | No | `3000` | TCP port the HTTP server listens on. |
| `SESSION_IDLE_TIMEOUT_MS` | No | `1800000` (30 min) | Milliseconds of inactivity after which an MCP session is closed and removed from memory. |
| `LOG_REQUESTS` | No | `false` | Set to `true` to log every incoming request method, path, and headers to stdout. Authorization headers are truncated to 15 characters for safety. |

### Generating a JWT_SECRET

```bash
openssl rand -hex 32
```

or

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Docker

```bash
# Build
docker build -t zendesk-mcp-server .

# Run
docker run -p 3000:3000 \
  -e JWT_SECRET=<your-secret> \
  zendesk-mcp-server
```

The image is based on `node:22-alpine`, runs as the unprivileged `node` user, and exposes port 3000.

## AWS Fargate Deployment

The server is designed to run as a Fargate task behind an API Gateway HTTP API with a VPC Link (no ALB/NLB required via Cloud Map SRV records).

**Requirements:**

- The Fargate task must run in a **public subnet** with `AssignPublicIp: ENABLED` (for outbound Zendesk API calls), or in a private subnet with a NAT Gateway.
- Set `JWT_SECRET` as a secret in the ECS task definition (via Secrets Manager or SSM Parameter Store).
- API Gateway must forward the original `Host` header as `X-Forwarded-Host` so the OAuth discovery URLs are generated correctly.

### Required VPC Endpoints (private subnets without NAT)

| Service | Type |
|---|---|
| `ecr.api` | Interface |
| `ecr.dkr` | Interface |
| `s3` | Gateway |
| `logs` | Interface |

## OAuth Flow

Claude.ai discovers the server's OAuth metadata automatically:

1. Client hits `GET /.well-known/oauth-protected-resource` → learns the authorization server URL
2. Client hits `GET /.well-known/oauth-authorization-server` → learns the auth/token endpoints
3. Client registers itself via `POST /register` (dynamic, no pre-registration needed)
4. User is redirected to `GET /authorize` → enters Zendesk subdomain, email, and API token
5. Server issues an auth code, client exchanges it via `POST /token`
6. Client receives a JWE access token containing the encrypted credentials
7. All MCP requests include the token as `Authorization: Bearer <token>`

The access token is valid for **8 hours**.

## MCP Tools

### Articles
| Tool | Description |
|---|---|
| `list_articles` | List articles, optionally filtered by locale, section, sort, and pagination |
| `get_article` | Get a specific article by ID |
| `create_article` | Create an article in a section |
| `update_article` | Update an existing article |
| `delete_article` | Permanently delete an article |
| `search_articles` | Full-text search across articles |
| `list_article_translations` | List all translations for an article |
| `create_article_translation` | Add a new locale translation |
| `update_article_translation` | Update an existing translation |

### Sections
| Tool | Description |
|---|---|
| `list_sections` | List sections, optionally filtered by category |
| `get_section` | Get a specific section by ID |
| `create_section` | Create a section inside a category |
| `update_section` | Update an existing section |
| `delete_section` | Permanently delete a section and its articles |

### Categories
| Tool | Description |
|---|---|
| `list_categories` | List all categories |
| `get_category` | Get a specific category by ID |
| `create_category` | Create a new category |
| `update_category` | Update an existing category |
| `delete_category` | Permanently delete a category, its sections, and their articles |

## Project Structure

```
src/
├── index.ts              # Express server, session management, MCP endpoints
├── server.ts             # MCP server factory, tool registration
├── base-url.ts           # Derives HTTPS base URL from request headers
├── zendesk-client.ts     # fetch-based Zendesk API client (Basic auth)
├── oauth/
│   ├── routes.ts         # OAuth endpoints (discovery, authorize, token, register)
│   ├── jwt.ts            # JWE token creation and verification (jose, AES-256-GCM)
│   └── store.ts          # In-memory auth code store (5-minute TTL)
└── tools/
    ├── utils.ts          # Shared MCP response helpers (ok, err, qs)
    ├── articles.ts       # Article tools
    ├── sections.ts       # Section tools
    └── categories.ts     # Category tools
```

## Development

```bash
npm run dev     # tsx watch — restarts on file changes
npm run build   # tsc — compile to dist/
npm start       # node dist/index.js
```

TypeScript is configured for ESM output (`NodeNext` module resolution). All imports within `src/` must use the `.js` extension.

## Security Notes

- Zendesk credentials are encrypted in the JWE token with AES-256-GCM and never written to disk or logs.
- The `JWT_SECRET` must be kept secret and stable across deployments. Rotating it invalidates all active tokens.
- `LOG_REQUESTS=true` truncates Authorization headers to 15 characters before logging.
- Auth codes expire after 5 minutes and are single-use (consumed on first token exchange).
