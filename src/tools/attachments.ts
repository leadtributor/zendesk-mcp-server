import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZendeskClient } from '../zendesk-client.js';
import { ok, err } from './utils.js';

export function registerAttachmentTools(server: McpServer, client: ZendeskClient): void {
  server.tool(
    'list_article_attachments',
    'List all attachments for a Help Center article, including their content_url values for embedding in HTML.',
    {
      article_id: z.number().int().positive().describe('Article ID'),
      locale: z.string().optional().describe('Locale code, e.g. "en-us"'),
    },
    async ({ article_id, locale }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/articles/${article_id}/attachments`
          : `/help_center/articles/${article_id}/attachments`;
        return ok(await client.request('GET', path));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'request_article_attachment_upload_url',
    [
      'Step 1 of 2 for uploading a file to a Help Center article.',
      'Requests a signed upload URL from Zendesk Guide Media API.',
      'Returns upload_id and upload_url — the client must PUT the raw file bytes directly to upload_url',
      '(no Authorization header, Content-Type must match the content_type given here).',
      'After the PUT succeeds, call finalize_article_attachment with the upload_id to complete the process.',
    ].join(' '),
    {
      content_type: z
        .string()
        .describe('MIME type of the file, e.g. "image/png" or "image/jpeg"'),
      file_size: z
        .number()
        .int()
        .positive()
        .describe('File size in bytes (required by Zendesk to generate the signed URL)'),
    },
    async ({ content_type, file_size }) => {
      try {
        const resp = await client.request<{
          upload_url: { url: string; asset_upload_id: string };
          headers: Record<string, string>;
        }>(
          'POST',
          '/guide/medias/upload_url',
          { content_type, file_size },
        );
        return ok({
          upload_id: resp.upload_url.asset_upload_id,
          upload_url: resp.upload_url.url,
          upload_headers: resp.headers,
          instructions: [
            `PUT the raw file bytes to upload_url.`,
            `Include all key-value pairs from upload_headers as HTTP headers on the PUT request.`,
            `Do not send an Authorization header to the upload_url.`,
            `Then call finalize_article_attachment with the upload_id.`,
          ],
        });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'finalize_article_attachment',
    [
      'Step 2 of 2 for uploading a file to a Help Center article.',
      'Call this after the client has successfully PUT the file to the upload_url from request_article_attachment_upload_url.',
      'Creates the Zendesk media object and associates it with the article.',
      'Returns the article_attachment including content_url — for inline images use this URL as <img src="{content_url}" /> in the article HTML body.',
    ].join(' '),
    {
      upload_id: z
        .string()
        .describe('The upload_id returned by request_article_attachment_upload_url'),
      filename: z.string().describe('Filename including extension, e.g. "screenshot.png"'),
      article_id: z
        .number()
        .int()
        .positive()
        .describe('ID of the article to associate the attachment with'),
      inline: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to embed inline in the article body (default: true)'),
      locale: z.string().optional().describe('Locale for the attachment, e.g. "en-us"'),
    },
    async ({ upload_id, filename, article_id, inline, locale }) => {
      try {
        // Commit the upload and create a media object
        const mediaResp = await client.request<{ id: string }>(
          'POST',
          '/guide/medias',
          { asset_upload_id: upload_id, filename },
        );

        // Associate the media object with the article
        const form = new FormData();
        form.set('guide_media_id', String(mediaResp.id));
        form.set('inline', String(inline ?? true));
        if (locale) form.set('locale', locale);

        return ok(
          await client.requestMultipart(
            'POST',
            `/help_center/articles/${article_id}/attachments`,
            form,
          ),
        );
      } catch (e) {
        return err(e);
      }
    },
  );
}
