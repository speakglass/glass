import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

// For server-side auth callbacks, we can use internal Docker names
// This only runs on the Next.js server, never in the browser
const apiBase = process.env.GLASS_API_BASE_URL || process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error('Email and password are required');
        }
        const response = await fetch(`${apiBase}/accounts/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({ detail: 'Invalid email or password' }));
          // Throw error with the message from backend
          throw new Error(data.detail || 'Invalid email or password');
        }
        const data = (await response.json()) as {
          id: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
        };
        return {
          id: data.id,
          email: data.email,
          name: data.name,
          image: data.avatar_url || null,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user, account }) {
      // For Google OAuth, register user in backend if not exists
      if (account?.provider === 'google' && user.email) {
        try {
          // Check if user exists, if not register them
          const response = await fetch(`${apiBase}/accounts/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              // For OAuth users, we don't set a password
            }),
          });

          if (response.ok) {
            const data = await response.json();
            // Update user.id with backend user ID
            user.id = data.id;
            console.log(`[auth] Registered new OAuth user: ${user.id}`);
          } else if (response.status === 409) {
            // User already exists, that's fine
            // We'll get the ID from the verify endpoint
            const verifyResponse = await fetch(`${apiBase}/accounts/verify-oauth`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: user.email,
              }),
            });

            if (verifyResponse.ok) {
              const data = await verifyResponse.json();
              user.id = data.id;
              console.log(`[auth] Verified existing OAuth user: ${user.id}`);
            } else {
              console.error(`[auth] Failed to verify OAuth user: ${verifyResponse.status}`);
              return false;
            }
          } else {
            console.error(`[auth] Failed to register OAuth user: ${response.status}`);
            return false;
          }
        } catch (error) {
          console.error('[auth] Failed to register/verify OAuth user:', error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // When user signs in, set the token.sub from user.id
      if (user?.id) {
        token.sub = String(user.id);
      }
      if (account?.provider === 'google' && user?.email) {
        token.email = user.email;
      }
      // Ensure token.sub is always set
      if (!token.sub) {
        console.error('[auth] JWT callback: token.sub is missing!', { user, account });
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) {
          (session.user as unknown as Record<string, unknown>).id = token.sub;
        } else {
          console.error('[auth] Session callback: token.sub is missing!');
        }
      }
      return session;
    },
  },
});
