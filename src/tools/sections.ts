import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZendeskClient } from '../zendesk-client.js';
import { ok, err, qs } from './utils.js';

export function registerSectionTools(server: McpServer, client: ZendeskClient): void {
  server.tool(
    'list_sections',
    'List Help Center sections. Optionally filter by category.',
    {
      locale: z.string().optional().describe('Locale code, e.g. "de" or "en-us"'),
      category_id: z.number().int().positive().optional().describe('Filter by category ID'),
      page: z.number().int().positive().optional(),
      per_page: z.number().int().min(1).max(100).optional(),
      sort_by: z.enum(['position', 'title', 'created_at', 'updated_at']).optional(),
      sort_order: z.enum(['asc', 'desc']).optional(),
    },
    async ({ locale, category_id, page, per_page, sort_by, sort_order }) => {
      try {
        const p = new URLSearchParams();
        if (page) p.set('page', String(page));
        if (per_page) p.set('per_page', String(per_page));
        if (sort_by) p.set('sort_by', sort_by);
        if (sort_order) p.set('sort_order', sort_order);

        let path: string;
        if (category_id) {
          path = locale
            ? `/help_center/${locale}/categories/${category_id}/sections${qs(p)}`
            : `/help_center/categories/${category_id}/sections${qs(p)}`;
        } else {
          path = locale
            ? `/help_center/${locale}/sections${qs(p)}`
            : `/help_center/sections${qs(p)}`;
        }

        return ok(await client.request('GET', path));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'get_section',
    'Get a specific Help Center section by ID.',
    {
      section_id: z.number().int().positive().describe('Section ID'),
      locale: z.string().optional().describe('Locale code'),
    },
    async ({ section_id, locale }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/sections/${section_id}`
          : `/help_center/sections/${section_id}`;
        return ok(await client.request('GET', path));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'create_section',
    'Create a new section inside a Help Center category.',
    {
      category_id: z.number().int().positive().describe('Parent category ID'),
      name: z.string().describe('Section name'),
      locale: z.string().optional().describe('Locale code'),
      description: z.string().optional().describe('Section description'),
      position: z.number().int().optional().describe('Position within the category'),
      user_segment_id: z
        .number()
        .int()
        .nullable()
        .optional()
        .describe('User segment ID (null = everyone)'),
    },
    async ({ category_id, name, locale, description, position, user_segment_id }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/categories/${category_id}/sections`
          : `/help_center/categories/${category_id}/sections`;

        const section: Record<string, unknown> = { name };
        if (description !== undefined) section.description = description;
        if (position !== undefined) section.position = position;
        if (user_segment_id !== undefined) section.user_segment_id = user_segment_id;

        return ok(await client.request('POST', path, { section }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'update_section',
    'Update an existing Help Center section.',
    {
      section_id: z.number().int().positive().describe('Section ID'),
      name: z.string().optional(),
      locale: z.string().optional().describe('Locale of the translation to update'),
      description: z.string().optional(),
      position: z.number().int().optional(),
      user_segment_id: z.number().int().nullable().optional(),
    },
    async ({ section_id, name, locale, description, position, user_segment_id }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/sections/${section_id}`
          : `/help_center/sections/${section_id}`;

        const section: Record<string, unknown> = {};
        if (name !== undefined) section.name = name;
        if (description !== undefined) section.description = description;
        if (position !== undefined) section.position = position;
        if (user_segment_id !== undefined) section.user_segment_id = user_segment_id;

        return ok(await client.request('PUT', path, { section }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'delete_section',
    'Permanently delete a Help Center section and all its articles.',
    {
      section_id: z.number().int().positive().describe('Section ID'),
    },
    async ({ section_id }) => {
      try {
        await client.request('DELETE', `/help_center/sections/${section_id}`);
        return ok({ message: `Section ${section_id} deleted.` });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'list_section_translations',
    'List all translations for a Help Center section.',
    {
      section_id: z.number().int().positive().describe('Section ID'),
    },
    async ({ section_id }) => {
      try {
        return ok(await client.request('GET', `/help_center/sections/${section_id}/translations`));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'get_section_translation',
    'Get a specific translation of a Help Center section by locale.',
    {
      section_id: z.number().int().positive().describe('Section ID'),
      locale: z.string().describe('Locale code, e.g. "de" or "en-us"'),
    },
    async ({ section_id, locale }) => {
      try {
        return ok(await client.request('GET', `/help_center/sections/${section_id}/translations/${locale}`));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'create_section_translation',
    'Create a translation for a Help Center section.',
    {
      section_id: z.number().int().positive().describe('Section ID'),
      locale: z.string().describe('Locale code, e.g. "de" or "en-us"'),
      title: z.string().describe('Translated section name'),
      body: z.string().optional().describe('Translated section description'),
    },
    async ({ section_id, locale, title, body }) => {
      try {
        const translation: Record<string, unknown> = { locale, title };
        if (body !== undefined) translation.body = body;
        return ok(await client.request('POST', `/help_center/sections/${section_id}/translations`, { translation }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'update_section_translation',
    'Update an existing translation of a Help Center section.',
    {
      section_id: z.number().int().positive().describe('Section ID'),
      locale: z.string().describe('Locale code of the translation to update'),
      title: z.string().optional().describe('New translated section name'),
      body: z.string().optional().describe('New translated section description'),
    },
    async ({ section_id, locale, title, body }) => {
      try {
        const translation: Record<string, unknown> = {};
        if (title !== undefined) translation.title = title;
        if (body !== undefined) translation.body = body;
        return ok(await client.request('PUT', `/help_center/sections/${section_id}/translations/${locale}`, { translation }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'delete_section_translation',
    'Delete a specific translation of a Help Center section.',
    {
      section_id: z.number().int().positive().describe('Section ID'),
      locale: z.string().describe('Locale code of the translation to delete'),
    },
    async ({ section_id, locale }) => {
      try {
        await client.request('DELETE', `/help_center/sections/${section_id}/translations/${locale}`);
        return ok({ message: `Translation "${locale}" for section ${section_id} deleted.` });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'list_missing_section_translations',
    'List locales that have no translation for a Help Center section.',
    {
      section_id: z.number().int().positive().describe('Section ID'),
    },
    async ({ section_id }) => {
      try {
        return ok(await client.request('GET', `/help_center/sections/${section_id}/translations/missing`));
      } catch (e) {
        return err(e);
      }
    },
  );
}
