import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

// For server-side auth callbacks, we can use internal Docker names
// This only runs on the Next.js server, never in the browser
const apiBase = process.env.GLASS_API_URL_INTERNAL || process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
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
      // For Google OAuth, ensure user exists in backend
      if (account?.provider === 'google' && user.email) {
        try {
          const response = await fetch(`${apiBase}/accounts/oauth-signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              avatar_url: user.image,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            user.id = data.id;
          } else {
            console.error(`[auth] OAuth sign-in failed: ${response.status} - ${apiBase}`);
            return false;
          }
        } catch (error) {
          console.error('[auth] OAuth sign-in error:', error instanceof Error ? error.message : error);
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
