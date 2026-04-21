import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZendeskClient } from '../zendesk-client.js';
import { ok, err } from './utils.js';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB — Zendesk attachment limit

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
    'upload_article_image',
    [
      'Upload an image and associate it as an inline attachment to a Help Center article.',
      'Uses the Zendesk Guide Media API (3-step upload + association).',
      'Returns the article_attachment object including content_url — use that URL in article HTML as <img src="{content_url}" />.',
    ].join(' '),
    {
      article_id: z
        .number()
        .int()
        .positive()
        .describe('ID of the article to attach the image to'),
      filename: z.string().describe('Filename including extension, e.g. "screenshot.png"'),
      content_type: z
        .enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])
        .describe('MIME type of the image'),
      data_base64: z.string().describe('Base64-encoded image file content'),
      locale: z.string().optional().describe('Locale for the attachment, e.g. "en-us"'),
    },
    async ({ article_id, filename, content_type, data_base64, locale }) => {
      try {
        const imageBuffer = Buffer.from(data_base64, 'base64');
        if (imageBuffer.byteLength > MAX_FILE_BYTES) {
          return err(
            new Error(`File size ${imageBuffer.byteLength} bytes exceeds the 20 MB limit`),
          );
        }

        // Step 1: Request a signed S3 upload URL from Zendesk
        const uploadUrlResp = await client.request<{ id: string; url: string }>(
          'POST',
          '/guide/medias/upload_url',
          { content_type, file_size: imageBuffer.byteLength },
        );

        // Step 2: Upload raw binary to the S3 signed URL (no Zendesk auth header)
        await client.uploadToSignedUrl(uploadUrlResp.url, imageBuffer, content_type);

        // Step 3: Commit the upload and create a media object in Zendesk
        const mediaResp = await client.request<{ id: string }>(
          'POST',
          '/guide/medias',
          { asset_upload_id: uploadUrlResp.id, filename },
        );

        // Step 4: Associate the media object with the article as an inline attachment
        const form = new FormData();
        form.set('guide_media_id', String(mediaResp.id));
        form.set('inline', 'true');
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

  server.tool(
    'attach_file_to_article',
    [
      'Upload any file (image, PDF, document) as an attachment to a Help Center article',
      'using a direct multipart upload.',
      'Returns the article_attachment object including content_url.',
      'For inline images to embed in article HTML, prefer upload_article_image instead.',
    ].join(' '),
    {
      article_id: z
        .number()
        .int()
        .positive()
        .describe('ID of the article to attach the file to'),
      filename: z.string().describe('Filename including extension, e.g. "report.pdf"'),
      content_type: z
        .string()
        .describe('MIME type of the file, e.g. "application/pdf" or "image/png"'),
      data_base64: z.string().describe('Base64-encoded file content'),
      inline: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to embed inline in the article body (default: false)'),
      locale: z.string().optional().describe('Locale for the attachment, e.g. "en-us"'),
    },
    async ({ article_id, filename, content_type, data_base64, inline, locale }) => {
      try {
        const fileBuffer = Buffer.from(data_base64, 'base64');
        if (fileBuffer.byteLength > MAX_FILE_BYTES) {
          return err(
            new Error(`File size ${fileBuffer.byteLength} bytes exceeds the 20 MB limit`),
          );
        }

        const form = new FormData();
        form.set('file', new Blob([fileBuffer], { type: content_type }), filename);
        form.set('inline', String(inline ?? false));
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
