import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZendeskClient } from '../zendesk-client.js';
import { ok, err, qs } from './utils.js';

export function registerArticleTools(server: McpServer, client: ZendeskClient): void {
  server.tool(
    'list_articles',
    'List Help Center articles. Optionally filter by locale, section, and sort/paginate.',
    {
      locale: z.string().optional().describe('Locale code, e.g. "de" or "en-us"'),
      section_id: z.number().int().positive().optional().describe('Filter by section ID'),
      page: z.number().int().positive().optional().describe('Page number (default: 1)'),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Results per page (default: 30, max: 100)'),
      sort_by: z
        .enum(['position', 'title', 'created_at', 'updated_at'])
        .optional()
        .describe('Sort field'),
      sort_order: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
    },
    async ({ locale, section_id, page, per_page, sort_by, sort_order }) => {
      try {
        const p = new URLSearchParams();
        if (page) p.set('page', String(page));
        if (per_page) p.set('per_page', String(per_page));
        if (sort_by) p.set('sort_by', sort_by);
        if (sort_order) p.set('sort_order', sort_order);

        let path: string;
        if (section_id) {
          path = locale
            ? `/help_center/${locale}/sections/${section_id}/articles${qs(p)}`
            : `/help_center/sections/${section_id}/articles${qs(p)}`;
        } else {
          path = locale
            ? `/help_center/${locale}/articles${qs(p)}`
            : `/help_center/articles${qs(p)}`;
        }

        return ok(await client.request('GET', path));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'get_article',
    'Get a specific Help Center article by ID.',
    {
      article_id: z.number().int().positive().describe('Article ID'),
      locale: z.string().optional().describe('Locale code, e.g. "de" or "en-us"'),
    },
    async ({ article_id, locale }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/articles/${article_id}`
          : `/help_center/articles/${article_id}`;
        return ok(await client.request('GET', path));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'create_article',
    'Create a new article in a Help Center section.',
    {
      section_id: z.number().int().positive().describe('Section ID to create the article in'),
      title: z.string().describe('Article title'),
      body: z.string().describe('Article body (HTML)'),
      locale: z.string().optional().describe('Locale code (defaults to account default)'),
      draft: z.boolean().optional().describe('Save as draft (default: false)'),
      promoted: z.boolean().optional().describe('Pin article to top of section'),
      position: z.number().int().optional().describe('Position within the section'),
      user_segment_id: z
        .number()
        .int()
        .nullable()
        .optional()
        .describe('User segment ID for access control (null = everyone)'),
      permission_group_id: z.number().int().optional().describe('Permission group ID'),
      label_names: z.array(z.string()).optional().describe('Labels to attach'),
    },
    async ({
      section_id,
      title,
      body,
      locale,
      draft,
      promoted,
      position,
      user_segment_id,
      permission_group_id,
      label_names,
    }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/sections/${section_id}/articles`
          : `/help_center/sections/${section_id}/articles`;

        const article: Record<string, unknown> = { title, body };
        if (draft !== undefined) article.draft = draft;
        if (promoted !== undefined) article.promoted = promoted;
        if (position !== undefined) article.position = position;
        if (user_segment_id !== undefined) article.user_segment_id = user_segment_id;
        if (permission_group_id !== undefined) article.permission_group_id = permission_group_id;
        if (label_names !== undefined) article.label_names = label_names;

        return ok(await client.request('POST', path, { article }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'update_article',
    'Update an existing Help Center article.',
    {
      article_id: z.number().int().positive().describe('Article ID'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New body (HTML)'),
      locale: z.string().optional().describe('Locale of the translation to update'),
      draft: z.boolean().optional(),
      promoted: z.boolean().optional(),
      position: z.number().int().optional(),
      user_segment_id: z.number().int().nullable().optional(),
      permission_group_id: z.number().int().optional(),
      label_names: z
        .array(z.string())
        .optional()
        .describe('Labels — replaces all existing labels'),
    },
    async ({
      article_id,
      title,
      body,
      locale,
      draft,
      promoted,
      position,
      user_segment_id,
      permission_group_id,
      label_names,
    }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/articles/${article_id}`
          : `/help_center/articles/${article_id}`;

        const article: Record<string, unknown> = {};
        if (title !== undefined) article.title = title;
        if (body !== undefined) article.body = body;
        if (draft !== undefined) article.draft = draft;
        if (promoted !== undefined) article.promoted = promoted;
        if (position !== undefined) article.position = position;
        if (user_segment_id !== undefined) article.user_segment_id = user_segment_id;
        if (permission_group_id !== undefined) article.permission_group_id = permission_group_id;
        if (label_names !== undefined) article.label_names = label_names;

        return ok(await client.request('PUT', path, { article }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'delete_article',
    'Permanently delete a Help Center article.',
    {
      article_id: z.number().int().positive().describe('Article ID'),
    },
    async ({ article_id }) => {
      try {
        await client.request('DELETE', `/help_center/articles/${article_id}`);
        return ok({ message: `Article ${article_id} deleted.` });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'search_articles',
    'Full-text search across Help Center articles.',
    {
      query: z.string().describe('Search query'),
      locale: z.string().optional().describe('Restrict results to a locale'),
      category: z.number().int().optional().describe('Restrict results to a category ID'),
      section: z.number().int().optional().describe('Restrict results to a section ID'),
      page: z.number().int().positive().optional(),
      per_page: z.number().int().min(1).max(100).optional(),
    },
    async ({ query, locale, category, section, page, per_page }) => {
      try {
        const p = new URLSearchParams({ query });
        if (locale) p.set('locale', locale);
        if (category) p.set('category', String(category));
        if (section) p.set('section', String(section));
        if (page) p.set('page', String(page));
        if (per_page) p.set('per_page', String(per_page));

        return ok(await client.request('GET', `/help_center/articles/search?${p}`));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'list_article_translations',
    'List all available translations for a Help Center article.',
    {
      article_id: z.number().int().positive().describe('Article ID'),
    },
    async ({ article_id }) => {
      try {
        return ok(
          await client.request('GET', `/help_center/articles/${article_id}/translations`),
        );
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'create_article_translation',
    'Add a new locale translation for a Help Center article.',
    {
      article_id: z.number().int().positive().describe('Article ID'),
      locale: z.string().describe('Target locale, e.g. "de" or "fr"'),
      title: z.string().describe('Translated title'),
      body: z.string().describe('Translated body (HTML)'),
      draft: z.boolean().optional().describe('Save as draft'),
    },
    async ({ article_id, locale, title, body, draft }) => {
      try {
        const translation: Record<string, unknown> = { locale, title, body };
        if (draft !== undefined) translation.draft = draft;

        return ok(
          await client.request(
            'POST',
            `/help_center/articles/${article_id}/translations`,
            { translation },
          ),
        );
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'update_article_translation',
    'Update an existing translation of a Help Center article.',
    {
      article_id: z.number().int().positive().describe('Article ID'),
      locale: z.string().describe('Locale of the translation to update'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New body (HTML)'),
      draft: z.boolean().optional(),
    },
    async ({ article_id, locale, title, body, draft }) => {
      try {
        const translation: Record<string, unknown> = {};
        if (title !== undefined) translation.title = title;
        if (body !== undefined) translation.body = body;
        if (draft !== undefined) translation.draft = draft;

        return ok(
          await client.request(
            'PUT',
            `/help_center/articles/${article_id}/translations/${locale}`,
            { translation },
          ),
        );
      } catch (e) {
        return err(e);
      }
    },
  );
}
