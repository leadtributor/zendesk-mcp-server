import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZendeskClient } from '../zendesk-client.js';
import { ok, err, qs } from './utils.js';

export function registerCategoryTools(server: McpServer, client: ZendeskClient): void {
  server.tool(
    'list_categories',
    'List all Help Center categories.',
    {
      locale: z.string().optional().describe('Locale code, e.g. "de" or "en-us"'),
      page: z.number().int().positive().optional(),
      per_page: z.number().int().min(1).max(100).optional(),
      sort_by: z.enum(['position', 'title', 'created_at', 'updated_at']).optional(),
      sort_order: z.enum(['asc', 'desc']).optional(),
    },
    async ({ locale, page, per_page, sort_by, sort_order }) => {
      try {
        const p = new URLSearchParams();
        if (page) p.set('page', String(page));
        if (per_page) p.set('per_page', String(per_page));
        if (sort_by) p.set('sort_by', sort_by);
        if (sort_order) p.set('sort_order', sort_order);

        const path = locale
          ? `/help_center/${locale}/categories${qs(p)}`
          : `/help_center/categories${qs(p)}`;

        return ok(await client.request('GET', path));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'get_category',
    'Get a specific Help Center category by ID.',
    {
      category_id: z.number().int().positive().describe('Category ID'),
      locale: z.string().optional().describe('Locale code'),
    },
    async ({ category_id, locale }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/categories/${category_id}`
          : `/help_center/categories/${category_id}`;
        return ok(await client.request('GET', path));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'create_category',
    'Create a new Help Center category.',
    {
      name: z.string().describe('Category name'),
      locale: z.string().optional().describe('Locale code'),
      description: z.string().optional().describe('Category description'),
      position: z.number().int().optional().describe('Display position'),
    },
    async ({ name, locale, description, position }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/categories`
          : `/help_center/categories`;

        const category: Record<string, unknown> = { name };
        if (description !== undefined) category.description = description;
        if (position !== undefined) category.position = position;

        return ok(await client.request('POST', path, { category }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'update_category',
    'Update an existing Help Center category.',
    {
      category_id: z.number().int().positive().describe('Category ID'),
      name: z.string().optional(),
      locale: z.string().optional().describe('Locale of the translation to update'),
      description: z.string().optional(),
      position: z.number().int().optional(),
    },
    async ({ category_id, name, locale, description, position }) => {
      try {
        const path = locale
          ? `/help_center/${locale}/categories/${category_id}`
          : `/help_center/categories/${category_id}`;

        const category: Record<string, unknown> = {};
        if (name !== undefined) category.name = name;
        if (description !== undefined) category.description = description;
        if (position !== undefined) category.position = position;

        return ok(await client.request('PUT', path, { category }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'delete_category',
    'Permanently delete a Help Center category, all its sections, and their articles.',
    {
      category_id: z.number().int().positive().describe('Category ID'),
    },
    async ({ category_id }) => {
      try {
        await client.request('DELETE', `/help_center/categories/${category_id}`);
        return ok({ message: `Category ${category_id} deleted.` });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'list_category_translations',
    'List all translations for a Help Center category.',
    {
      category_id: z.number().int().positive().describe('Category ID'),
    },
    async ({ category_id }) => {
      try {
        return ok(await client.request('GET', `/help_center/categories/${category_id}/translations`));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'get_category_translation',
    'Get a specific translation of a Help Center category by locale.',
    {
      category_id: z.number().int().positive().describe('Category ID'),
      locale: z.string().describe('Locale code, e.g. "de" or "en-us"'),
    },
    async ({ category_id, locale }) => {
      try {
        return ok(await client.request('GET', `/help_center/categories/${category_id}/translations/${locale}`));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'create_category_translation',
    'Create a translation for a Help Center category.',
    {
      category_id: z.number().int().positive().describe('Category ID'),
      locale: z.string().describe('Locale code, e.g. "de" or "en-us"'),
      title: z.string().describe('Translated category name'),
      body: z.string().optional().describe('Translated category description'),
    },
    async ({ category_id, locale, title, body }) => {
      try {
        const translation: Record<string, unknown> = { locale, title };
        if (body !== undefined) translation.body = body;
        return ok(await client.request('POST', `/help_center/categories/${category_id}/translations`, { translation }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'update_category_translation',
    'Update an existing translation of a Help Center category.',
    {
      category_id: z.number().int().positive().describe('Category ID'),
      locale: z.string().describe('Locale code of the translation to update'),
      title: z.string().optional().describe('New translated category name'),
      body: z.string().optional().describe('New translated category description'),
    },
    async ({ category_id, locale, title, body }) => {
      try {
        const translation: Record<string, unknown> = {};
        if (title !== undefined) translation.title = title;
        if (body !== undefined) translation.body = body;
        return ok(await client.request('PUT', `/help_center/categories/${category_id}/translations/${locale}`, { translation }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'delete_category_translation',
    'Delete a specific translation of a Help Center category.',
    {
      category_id: z.number().int().positive().describe('Category ID'),
      locale: z.string().describe('Locale code of the translation to delete'),
    },
    async ({ category_id, locale }) => {
      try {
        await client.request('DELETE', `/help_center/categories/${category_id}/translations/${locale}`);
        return ok({ message: `Translation "${locale}" for category ${category_id} deleted.` });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    'list_missing_category_translations',
    'List locales that have no translation for a Help Center category.',
    {
      category_id: z.number().int().positive().describe('Category ID'),
    },
    async ({ category_id }) => {
      try {
        return ok(await client.request('GET', `/help_center/categories/${category_id}/translations/missing`));
      } catch (e) {
        return err(e);
      }
    },
  );
}
