import type { NextAuthOptions } from "next-auth"
import type { Adapter } from "next-auth/adapters"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"
import { db } from "@/server/db/client"
import { users, accounts, sessions, verificationTokens } from "@/server/db/schema"
import { eq, sql } from "drizzle-orm"
import bcrypt from "bcryptjs"

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  adapter: DrizzleAdapter(db, {
    usersTable: users as any,
    accountsTable: accounts as any,
    sessionsTable: sessions as any,
    verificationTokensTable: verificationTokens as any,
  }) as Adapter,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log("[Auth] Missing credentials")
          return null
        }

        try {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, credentials.email))
            .limit(1)

          if (!user) {
            console.log(`[Auth] User not found: ${credentials.email}`)
            return null
          }

          if (!user.password) {
            console.log(`[Auth] User has no password: ${credentials.email}`)
            return null
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          )

          if (!isPasswordValid) {
            console.log(`[Auth] Invalid password for: ${credentials.email}`)
            return null
          }

          console.log(`[Auth] Successfully authenticated: ${credentials.email}`)
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
            isSuperAdmin: user.isSuperAdmin,
          }
        } catch (error) {
          console.error("[Auth] Error during authorization:", error)
          if (error instanceof Error) {
            console.error("[Auth] Error message:", error.message)
            if (error.message.includes("password authentication failed")) {
              console.error("[Auth] Database connection failed - check DATABASE_URL in .env")
            }
          }
          return null
        }
      }
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          })
        ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          })
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Credentials provider handles its own validation
      if (account?.provider === "credentials") return true

      if (!user?.email) return "/auth/signin?error=NoEmail"

      // Check if user already exists
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, user.email))
        .limit(1)

      if (existingUser) return true

      // New user — allow if multitenant is enabled
      if (process.env.NEXT_PUBLIC_IS_MULTI_TENANT === "true") return true

      // New user, single-tenant — allow if no users exist yet (first setup)
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)

      if (count === 0) return true

      // Single-tenant with existing users — block new registrations
      return "/auth/signin?error=AccountNotFound"
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.isSuperAdmin = user.isSuperAdmin ?? false
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as "ADMIN" | "OWNER" | "VIEWER"
        session.user.isSuperAdmin = token.isSuperAdmin ?? false
      }
      return session
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
}