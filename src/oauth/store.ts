interface AuthCode {
  credentials: { subdomain: string; email: string; token: string };
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}

const codes = new Map<string, AuthCode>();

export function storeCode(code: string, data: AuthCode): void {
  codes.set(code, data);
  setTimeout(() => codes.delete(code), 5 * 60 * 1000);
}

export function consumeCode(code: string): AuthCode | undefined {
  const data = codes.get(code);
  if (data) codes.delete(code);
  return data;
}
