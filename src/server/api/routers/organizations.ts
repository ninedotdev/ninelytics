import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure } from "@/server/api/trpc"
import { organizations, organizationMembers, users, websites } from "@/server/db/schema"
import { eq, and, sql, count } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { isMultiTenant } from "@/lib/multi-tenant"

function ensureMultiTenant() {
  if (!isMultiTenant) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organizations are only available in multi-tenant mode",
    })
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

export const organizationsRouter = router({
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      ensureMultiTenant()
      const userId = ctx.session.user.id

      // Generate unique slug
      let slug = slugify(input.name)
      const [existing] = await ctx.db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1)
      if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`

      const [org] = await ctx.db
        .insert(organizations)
        .values({
          name: input.name,
          slug,
          ownerId: userId,
        })
        .returning()

      // Add creator as owner member
      await ctx.db.insert(organizationMembers).values({
        organizationId: org.id,
        userId,
        role: "owner",
      })

      return org
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    ensureMultiTenant()
    const userId = ctx.session.user.id

    const orgs = await ctx.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        role: organizationMembers.role,
        createdAt: organizations.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId))

    return orgs
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      ensureMultiTenant()
      const userId = ctx.session.user.id

      // Verify membership
      const [membership] = await ctx.db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, input.id),
          eq(organizationMembers.userId, userId),
        ))
        .limit(1)

      if (!membership && !ctx.session.user.isSuperAdmin) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" })
      }

      const [org] = await ctx.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, input.id))
        .limit(1)

      if (!org) throw new TRPCError({ code: "NOT_FOUND" })

      const members = await ctx.db
        .select({
          id: organizationMembers.id,
          userId: organizationMembers.userId,
          role: organizationMembers.role,
          createdAt: organizationMembers.createdAt,
          userName: users.name,
          userEmail: users.email,
          userImage: users.image,
        })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(eq(organizationMembers.organizationId, input.id))

      const [websiteCount] = await ctx.db
        .select({ count: count() })
        .from(websites)
        .where(eq(websites.organizationId, input.id))

      return {
        ...org,
        members,
        websiteCount: Number(websiteCount?.count ?? 0),
        currentUserRole: membership?.role ?? (ctx.session.user.isSuperAdmin ? "superadmin" : null),
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(2).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      ensureMultiTenant()
      const userId = ctx.session.user.id

      // Only org owner/admin can update
      const [membership] = await ctx.db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, input.id),
          eq(organizationMembers.userId, userId),
        ))
        .limit(1)

      if (!membership || membership.role === "member") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only org owners and admins can update" })
      }

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (input.name) updates.name = input.name

      const [updated] = await ctx.db
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, input.id))
        .returning()

      return updated
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      ensureMultiTenant()
      const userId = ctx.session.user.id

      // Only org owner can delete
      const [org] = await ctx.db
        .select({ ownerId: organizations.ownerId })
        .from(organizations)
        .where(eq(organizations.id, input.id))
        .limit(1)

      if (!org) throw new TRPCError({ code: "NOT_FOUND" })
      if (org.ownerId !== userId && !ctx.session.user.isSuperAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the org owner can delete" })
      }

      await ctx.db.delete(organizations).where(eq(organizations.id, input.id))
      return { success: true }
    }),

  inviteMember: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      email: z.string().email(),
      role: z.enum(["admin", "member"]).default("member"),
    }))
    .mutation(async ({ ctx, input }) => {
      ensureMultiTenant()
      const userId = ctx.session.user.id

      // Check inviter is org owner/admin
      const [membership] = await ctx.db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, userId),
        ))
        .limit(1)

      if (!membership || membership.role === "member") {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      // Find or create user
      let [user] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1)

      if (!user) {
        const tempPassword = Math.random().toString(36).slice(-8)
        const hashed = await bcrypt.hash(tempPassword, 12);
        [user] = await ctx.db
          .insert(users)
          .values({
            email: input.email,
            password: hashed,
            role: "OWNER",
          })
          .returning({ id: users.id })

        if (process.env.NODE_ENV === "development") {
          console.log(`[Org Invite] Created user ${input.email} with temp password: ${tempPassword}`)
        }
      }

      // Check not already a member
      const [existing] = await ctx.db
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, user.id),
        ))
        .limit(1)

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "User is already a member" })
      }

      await ctx.db.insert(organizationMembers).values({
        organizationId: input.organizationId,
        userId: user.id,
        role: input.role,
      })

      return { success: true, userId: user.id }
    }),

  removeMember: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      ensureMultiTenant()
      const currentUserId = ctx.session.user.id

      // Check remover is org owner/admin
      const [membership] = await ctx.db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, currentUserId),
        ))
        .limit(1)

      if (!membership || membership.role === "member") {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      // Can't remove the org owner
      const [org] = await ctx.db
        .select({ ownerId: organizations.ownerId })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1)

      if (org?.ownerId === input.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove the organization owner" })
      }

      await ctx.db.delete(organizationMembers).where(and(
        eq(organizationMembers.organizationId, input.organizationId),
        eq(organizationMembers.userId, input.userId),
      ))

      return { success: true }
    }),

  updateMemberRole: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      userId: z.string(),
      role: z.enum(["admin", "member"]),
    }))
    .mutation(async ({ ctx, input }) => {
      ensureMultiTenant()
      const currentUserId = ctx.session.user.id

      // Only org owner can change roles
      const [org] = await ctx.db
        .select({ ownerId: organizations.ownerId })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1)

      if (!org || (org.ownerId !== currentUserId && !ctx.session.user.isSuperAdmin)) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      // Can't change owner's role
      if (org.ownerId === input.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot change the owner's role" })
      }

      await ctx.db
        .update(organizationMembers)
        .set({ role: input.role })
        .where(and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.userId),
        ))

      return { success: true }
    }),
})
