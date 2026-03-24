import "dotenv/config"
import bcrypt from "bcryptjs"
import { sql } from "drizzle-orm"

import { db } from "@/server/db/client"
import { users } from "@/server/db/schema"

const log = (...args: unknown[]) => console.log(...args)

async function main() {
  log("🌱 Starting database seed...")

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@localhost"
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin"
  const adminName = process.env.SEED_ADMIN_NAME || "Admin"

  const hashedPassword = await bcrypt.hash(adminPassword, 12)

  const [admin] = await db
    .insert(users)
    .values({
      email: adminEmail,
      name: adminName,
      password: hashedPassword,
      role: "ADMIN",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: sql`excluded.name`,
        password: sql`excluded.password`,
        role: sql`excluded.role`,
      },
    })
    .returning()

  log("✅ Created admin user:", admin.email)

  log("\n🎉 Database seeding completed!")
  log("\n📋 Login credentials:")
  log(`   Email:    ${adminEmail}`)
  log(`   Password: ${adminPassword}`)

  if (!process.env.SEED_ADMIN_PASSWORD) {
    log("\n⚠️  You are using the default password.")
    log("   Set SEED_ADMIN_PASSWORD in your .env before running in production.")
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seeding failed:", err)
    process.exit(1)
  })
