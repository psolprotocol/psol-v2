import { NextAuthOptions } from 'next-auth';
import TwitchProvider from 'next-auth/providers/twitch';

function checkEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Missing required environment variable: ${name}`);
    // Return placeholder to prevent crash, but log the error
    return '';
  }
  return value;
}

export const authOptions: NextAuthOptions = {
  providers: [
    TwitchProvider({
      clientId: checkEnvVar('TWITCH_CLIENT_ID'),
      clientSecret: checkEnvVar('TWITCH_CLIENT_SECRET'),
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Sync user to our API
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        await fetch(`${apiUrl}/v1/users/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            twitchId: account?.providerAccountId || user.id,
            displayName: user.name || 'Unknown',
            email: user.email,
            profileImageUrl: user.image,
          }),
        });
      } catch (error) {
        console.error('Failed to sync user:', error);
        // Continue with sign in even if sync fails
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (account && user) {
        token.accessToken = account.access_token;
        token.twitchId = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken,
        user: {
          ...session.user,
          twitchId: token.twitchId as string,
        },
      };
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// Extend the default session type
declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      twitchId?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    twitchId?: string;
  }
}
