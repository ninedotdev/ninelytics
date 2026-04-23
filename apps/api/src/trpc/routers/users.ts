import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import { db } from "@ninelytics/shared/db"
import { users, websites, userWebsiteAccess } from "@ninelytics/db/schema"
import { eq, and, or, ilike, desc, sql } from "drizzle-orm"
import bcrypt from "bcryptjs"

const getUsersQuerySchema = z.object({
  search: z.string().optional(),
  role: z.enum(["ADMIN", "OWNER", "VIEWER"]).optional(),
})

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "OWNER", "VIEWER"]).default("OWNER"),
})

const updateUserSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  role: z.enum(["ADMIN", "OWNER", "VIEWER"]).optional(),
})

const inviteUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "OWNER", "VIEWER"]).default("OWNER"),
})

async function ensureAdmin(dbInstance: typeof db, userId: string) {
  const user = await dbInstance.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true, isSuperAdmin: true },
  })

  // Super admins always have access. In personal mode, ADMIN role also works.
  if (!user || (!user.isSuperAdmin && user.role !== "ADMIN")) {
    throw new Error("Forbidden")
  }

  return user
}

export const usersRouter = router({
  list: protectedProcedure
    .input(getUsersQuerySchema.optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const isSuperAdmin = ctx.session!.user.isSuperAdmin

      const whereConditions = []

      if (input?.search) {
        whereConditions.push(
          or(
            ilike(users.name, `%${input.search}%`),
            ilike(users.email, `%${input.search}%`)
          )
        )
      }

      if (input?.role) {
        whereConditions.push(eq(users.role, input.role))
      }

      // Regular users: only see users who share access to their websites
      // Super admins: see all users
      if (!isSuperAdmin) {
        const relatedUserIds = await ctx.db.execute<{ user_id: string }>(sql`
          SELECT DISTINCT uwa.user_id FROM user_website_access uwa
          JOIN websites w ON w.id = uwa.website_id
          WHERE w.owner_id = ${userId}
          UNION SELECT ${userId}
        `)
        const ids = (relatedUserIds as unknown as Array<{ user_id: string }>).map(r => r.user_id)
        if (ids.length > 0) {
          whereConditions.push(sql`${users.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)
        }
      }

      const usersList = await ctx.db.query.users.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          createdAt: true,
        },
        orderBy: [desc(users.createdAt)],
      })

      if (usersList.length === 0) return []

      // Get all counts in two bulk queries instead of N+1
      const userIds = usersList.map(u => u.id)
      const [ownedCounts, accessCounts] = await Promise.all([
        ctx.db.execute<{ owner_id: string; count: string }>(
          sql`SELECT owner_id, count(*)::text FROM websites WHERE owner_id IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)}) GROUP BY owner_id`
        ),
        ctx.db.execute<{ user_id: string; count: string }>(
          sql`SELECT user_id, count(*)::text FROM user_website_access WHERE user_id IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)}) GROUP BY user_id`
        ),
      ])

      const ownedMap = new Map((ownedCounts as unknown as Array<{ owner_id: string; count: string }>).map(r => [r.owner_id, Number(r.count)]))
      const accessMap = new Map((accessCounts as unknown as Array<{ user_id: string; count: string }>).map(r => [r.user_id, Number(r.count)]))

      return usersList.map(user => ({
        ...user,
        _count: {
          ownedWebsites: ownedMap.get(user.id) ?? 0,
          websiteAccess: accessMap.get(user.id) ?? 0,
        },
      }))
    }),

  create: protectedProcedure
    .input(createUserSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureAdmin(ctx.db, userId)

      // Check if user already exists
      const existingUser = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      })

      if (existingUser) {
        throw new Error("User with this email already exists")
      }

      const [newUser] = await ctx.db
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          role: input.role,
        })
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          image: users.image,
          createdAt: users.createdAt,
        })

      const ownedCount = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(websites)
        .where(eq(websites.ownerId, newUser.id))

      const accessCount = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(userWebsiteAccess)
        .where(eq(userWebsiteAccess.userId, newUser.id))

      return {
        ...newUser,
        _count: {
          ownedWebsites: Number(ownedCount[0]?.count ?? 0),
          websiteAccess: Number(accessCount[0]?.count ?? 0),
        },
      }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const targetUserId = input.id

      // Check if user is admin or requesting their own data
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true },
      })

      if (currentUser?.role !== "ADMIN" && userId !== targetUserId) {
        throw new Error("Forbidden")
      }

      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, targetUserId),
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          createdAt: true,
        },
      })

      if (!user) {
        throw new Error("User not found")
      }

      // Get owned websites
      const ownedWebsites = await ctx.db.query.websites.findMany({
        where: eq(websites.ownerId, user.id),
        columns: {
          id: true,
          name: true,
          url: true,
          createdAt: true,
        },
        orderBy: [desc(websites.createdAt)],
        limit: 10,
      })

      // Get website access
      const accessList = await ctx.db.query.userWebsiteAccess.findMany({
        where: eq(userWebsiteAccess.userId, user.id),
        columns: {
          id: true,
          accessLevel: true,
          createdAt: true,
          websiteId: true,
        },
        orderBy: [desc(userWebsiteAccess.createdAt)],
        limit: 10,
      })

      // Get website details for access
      const websiteAccess = await Promise.all(
        accessList.map(async (access) => {
          const website = await ctx.db.query.websites.findFirst({
            where: eq(websites.id, access.websiteId),
            columns: {
              id: true,
              name: true,
              url: true,
            },
          })
          return {
            id: access.id,
            accessLevel: access.accessLevel,
            createdAt: access.createdAt,
            website: website || { id: access.websiteId, name: "Unknown", url: "" },
          }
        })
      )

      const ownedCount = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(websites)
        .where(eq(websites.ownerId, user.id))

      const accessCount = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(userWebsiteAccess)
        .where(eq(userWebsiteAccess.userId, user.id))

      // Generate activity log (mock for now)
      const activityLog = [
        ...ownedWebsites.slice(0, 5).map((website) => ({
          id: `activity-${website.id}`,
          action: "website_created",
          entityType: "website",
          entityId: website.id,
          metadata: { websiteName: website.name },
          timestamp: website.createdAt,
        })),
        ...websiteAccess.slice(0, 5).map((access) => ({
          id: `activity-access-${access.id}`,
          action: "analytics_viewed",
          entityType: "website",
          entityId: access.website.id,
          metadata: { websiteName: access.website.name },
          timestamp: access.createdAt,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20)

      const lastActivity = activityLog[0]?.timestamp || user.createdAt

      return {
        ...user,
        ownedWebsites,
        websiteAccess,
        _count: {
          ownedWebsites: Number(ownedCount[0]?.count ?? 0),
          websiteAccess: Number(accessCount[0]?.count ?? 0),
        },
        lastActive: lastActivity,
        activityLog,
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: updateUserSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const targetUserId = input.id

      // Check if user is admin or updating their own profile
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true },
      })

      const isAdmin = currentUser?.role === "ADMIN"
      const isOwnProfile = userId === targetUserId

      if (!isAdmin && !isOwnProfile) {
        throw new Error("Forbidden")
      }

      // Only admins can change roles
      if (input.data.role && !isAdmin) {
        throw new Error("Only admins can change user roles")
      }

      // Prevent users from changing their own role
      if (input.data.role && isOwnProfile) {
        throw new Error("You cannot change your own role")
      }

      const [updated] = await ctx.db
        .update(users)
        .set(input.data)
        .where(eq(users.id, targetUserId))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          image: users.image,
          createdAt: users.createdAt,
        })

      const ownedCount = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(websites)
        .where(eq(websites.ownerId, updated.id))

      const accessCount = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(userWebsiteAccess)
        .where(eq(userWebsiteAccess.userId, updated.id))

      return {
        ...updated,
        _count: {
          ownedWebsites: Number(ownedCount[0]?.count ?? 0),
          websiteAccess: Number(accessCount[0]?.count ?? 0),
        },
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureAdmin(ctx.db, userId)

      // Prevent deleting own account
      if (userId === input.id) {
        throw new Error("You cannot delete your own account")
      }

      // Check if user exists
      const userToDelete = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.id),
      })

      if (!userToDelete) {
        throw new Error("User not found")
      }

      // Delete user and related data in a transaction
      await ctx.db.transaction(async (tx) => {
        // Delete user's website access
        await tx.delete(userWebsiteAccess).where(eq(userWebsiteAccess.userId, input.id))

        // Delete websites owned by the user
        await tx.delete(websites).where(eq(websites.ownerId, input.id))

        // Delete the user
        await tx.delete(users).where(eq(users.id, input.id))
      })

      return { message: "User deleted successfully" }
    }),

  invite: protectedProcedure
    .input(inviteUserSchema)
    .mutation(async ({ ctx, input }) => {

      // Check if user already exists
      const existingUser = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      })

      if (existingUser) {
        throw new Error("User with this email already exists")
      }

      // Generate a temporary password
      const tempPassword = Math.random().toString(36).slice(-8)
      const hashedPassword = await bcrypt.hash(tempPassword, 12)

      // Create the user with a temporary password
      const [newUser] = await ctx.db
        .insert(users)
        .values({
          name: input.email.split("@")[0], // Use email prefix as default name
          email: input.email,
          role: input.role,
          password: hashedPassword,
        })
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
        })

      // In a real application, you would send an invitation email here
      console.log(`Temporary password for ${input.email}: ${tempPassword}`)

      return {
        user: newUser,
        message: "User invitation sent successfully",
        tempPassword: process.env.NODE_ENV === "development" ? tempPassword : undefined,
      }
    }),
})

