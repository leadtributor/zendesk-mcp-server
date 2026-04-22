import { createHash, randomBytes } from 'crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
  const s = randomBytes(32).toString('hex');
  console.warn('JWT_SECRET not set — tokens will be invalid after restart.');
  return s;
})();

// 32-byte AES-256 key derived from the secret
const ENC_KEY = new Uint8Array(createHash('sha256').update(JWT_SECRET).digest());

export interface TokenPayload {
  subdomain: string;
  email: string;
  token: string;
}

export async function createToken(credentials: TokenPayload): Promise<string> {
  return new EncryptJWT({ ...credentials })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(ENC_KEY);
}

export async function verifyToken(jwt: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtDecrypt(jwt, ENC_KEY);
    const { subdomain, email, token } = payload;
    if (typeof subdomain !== 'string' || typeof email !== 'string' || typeof token !== 'string') {
      return null;
    }
    return { subdomain, email, token };
  } catch {
    return null;
  }
}
