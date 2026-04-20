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
}
