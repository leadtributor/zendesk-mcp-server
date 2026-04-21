import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZendeskClient, type ZendeskCredentials } from './zendesk-client.js';
import { registerArticleTools } from './tools/articles.js';
import { registerSectionTools } from './tools/sections.js';
import { registerCategoryTools } from './tools/categories.js';
import { registerAttachmentTools } from './tools/attachments.js';

export function createServer(credentials: ZendeskCredentials): McpServer {
  const server = new McpServer({
    name: 'zendesk-helpcenter',
    version: '1.0.0',
  });

  const client = new ZendeskClient(credentials);

  registerArticleTools(server, client);
  registerSectionTools(server, client);
  registerCategoryTools(server, client);
  registerAttachmentTools(server, client);

  return server;
}
