import "dotenv/config"
import bcrypt from "bcryptjs"
import { sql } from "drizzle-orm"

import { db } from "@/server/db/client"
import { users } from "@/server/db/schema"

const log = (...args: unknown[]) => console.log(...args)

async function main() {
  log("🔄 Resetting database...")
  
  // Delete all users
  await db.delete(users)
  log("✅ Deleted all users")

  log("🌱 Starting database seed...")

  const adminPassword = await bcrypt.hash("admin123", 12)

  const [admin] = await db
    .insert(users)
    .values({
      email: "admin@analytics.com",
      name: "System Administrator",
      password: adminPassword,
      role: "ADMIN",
    })
    .returning()
  
  log("✅ Created admin user:", admin.email)
  log("🎉 Database reset and seeding completed successfully!")
  log("\n📋 Login Credentials:")
  log("Admin: admin@analytics.com / admin123")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Reset and seeding failed:", err)
    process.exit(1)
  })

