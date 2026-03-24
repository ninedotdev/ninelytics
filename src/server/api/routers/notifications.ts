import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import { getNotifications, getUnreadCount, markAllAsRead, markAsRead, deleteNotification } from "@/lib/notifications"

export const notificationsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(20),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const limit = input?.limit ?? 20

      const [notifications, unreadCount] = await Promise.all([
        getNotifications(userId, limit),
        getUnreadCount(userId),
      ])

      return {
        notifications,
        unreadCount,
      }
    }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await markAsRead(userId, input.id)
      return { success: true }
    }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session!.user.id
    await markAllAsRead(userId)
    return { success: true }
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await deleteNotification(userId, input.id)
      return { success: true }
    }),
})

