export interface ZendeskCredentials {
  subdomain: string;
  email: string;
  token: string;
}

export class ZendeskClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(credentials: ZendeskCredentials) {
    this.baseUrl = `https://${credentials.subdomain}.zendesk.com/api/v2`;
    this.authHeader =
      'Basic ' +
      Buffer.from(`${credentials.email}/token:${credentials.token}`).toString('base64');
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zendesk API ${response.status} ${response.statusText}: ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  async requestMultipart<T = unknown>(method: string, path: string, form: FormData): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        // No Content-Type — fetch sets it automatically with the correct multipart boundary
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zendesk API ${response.status} ${response.statusText}: ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  async uploadToSignedUrl(signedUrl: string, data: Uint8Array, contentType: string): Promise<void> {
    // No Authorization header — S3 signed URLs embed their own auth as query parameters
    const response = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: new Blob([data.buffer as ArrayBuffer], { type: contentType }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`S3 upload ${response.status} ${response.statusText}: ${errorText}`);
    }
  }
}
