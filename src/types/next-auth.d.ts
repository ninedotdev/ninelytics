import { DefaultSession, DefaultUser } from "next-auth"
import { DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: "ADMIN" | "OWNER" | "VIEWER"
      isSuperAdmin: boolean
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    id: string
    role: "ADMIN" | "OWNER" | "VIEWER"
    isSuperAdmin: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string
    role: "ADMIN" | "OWNER" | "VIEWER"
    isSuperAdmin: boolean
  }
}