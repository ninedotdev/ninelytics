import "dotenv/config"
import { db } from "@/server/db/client"
import { users } from "@/server/db/schema"

async function checkUsers() {
  try {
    console.log("🔍 Checking users in database...")
    
    const allUsers = await db.query.users.findMany({
      columns: {
        id: true,
        email: true,
        name: true,
        role: true,
        password: true,
      },
    })

    console.log(`\n📊 Found ${allUsers.length} users:\n`)
    
    allUsers.forEach((user) => {
      console.log(`- ${user.email} (${user.role})`)
      console.log(`  Name: ${user.name || "N/A"}`)
      console.log(`  Has password: ${user.password ? "Yes" : "No"}`)
      console.log("")
    })

    if (allUsers.length === 0) {
      console.log("⚠️  No users found! Run 'npm run db:seed' to create users.")
    }
  } catch (error) {
    console.error("❌ Error checking users:", error)
    process.exit(1)
  }
}

checkUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Failed:", err)
    process.exit(1)
  })

