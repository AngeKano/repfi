import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Extend types for user and session so TypeScript knows about `id` and `type`
import {
  User as NextAuthUser,
  Session as NextAuthSession,
  DefaultSession,
  NextAuthOptions,
} from "next-auth";
import { JWT } from "next-auth/jwt";

// Type augmentation for JWT tokens and Session user
export type CustomUser = NextAuthUser & {
  id: string;
  type: string;
};
export type CustomSessionUser = DefaultSession["user"] & {
  id?: string;
  type?: string;
};
export type CustomToken = JWT & {
  type?: string;
};

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.password
        );
        if (!isValid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          type: user.type,
        } as CustomUser;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.type = (user as CustomUser).type;
      }
      return token as CustomToken;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as CustomSessionUser).id =
          token.sub ?? (token.id as string);
        (session.user as CustomSessionUser).type = (token as CustomToken).type;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
