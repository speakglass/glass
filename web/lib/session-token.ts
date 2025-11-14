import { SignJWT } from 'jose';
import type { Session } from 'next-auth';

const encoder = new TextEncoder();

function getSecret(): Uint8Array {
  const secret = process.env.GLASS_AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error('GLASS_AUTH_JWT_SECRET is not configured');
  }
  return encoder.encode(secret);
}

export async function issueSessionToken(user: Session['user']) {
  if (!user?.id || !user.email) {
    throw new Error('Missing user id or email for session token');
  }
  return new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    picture: user.image,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('glass-web')
    .setAudience('glass-api')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(getSecret());
}
