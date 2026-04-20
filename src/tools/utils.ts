export function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function err(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true as const };
}

export function qs(params: URLSearchParams): string {
  const s = params.toString();
  return s ? `?${s}` : '';
}
