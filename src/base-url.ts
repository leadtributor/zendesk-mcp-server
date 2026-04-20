import type { Request } from 'express';

export function getBaseUrl(req: Request): string {
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost';
  return `https://${host}`;
}
