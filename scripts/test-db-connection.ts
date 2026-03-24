import "dotenv/config"
import { getDatabaseUrl } from "@/lib/db-config"

async function testConnection() {
  try {
    console.log("🔍 Testing database connection...")
    
    const url = getDatabaseUrl()
    console.log("\n📋 DATABASE_URL (masked):")
    const maskedUrl = url.replace(/:([^:@]+)@/, ":****@")
    console.log(maskedUrl)
    
    // Try to parse the URL to verify it's valid
    const urlObj = new URL(url)
    console.log("\n✅ URL parsed successfully:")
    console.log(`  - Protocol: ${urlObj.protocol}`)
    console.log(`  - Host: ${urlObj.hostname}`)
    console.log(`  - Port: ${urlObj.port}`)
    console.log(`  - Database: ${urlObj.pathname.slice(1)}`)
    console.log(`  - User: ${urlObj.username}`)
    
    // Try to connect using postgres directly
    const postgres = await import("postgres")
    const sql = postgres.default(url, {
      max: 1,
      connect_timeout: 5,
    })
    
    try {
      const result = await sql`SELECT 1 as test`
      console.log("\n✅ Connection successful!")
      console.log(`  Test query result: ${result[0]?.test}`)
      
      // Check if users table exists
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      `
      
      if (tables.length > 0) {
        console.log("\n✅ Users table exists")
        
        // Count users
        const userCount = await sql`SELECT COUNT(*) as count FROM users`
        console.log(`  Total users: ${userCount[0]?.count || 0}`)
        
        // List users (without passwords)
        const users = await sql`SELECT email, name, role FROM users LIMIT 5`
        if (users.length > 0) {
          console.log("\n📋 Users in database:")
          users.forEach((u: any) => {
            console.log(`  - ${u.email} (${u.role})`)
          })
        } else {
          console.log("\n⚠️  No users found in database!")
          console.log("   Run 'npm run db:seed' to create users.")
        }
      } else {
        console.log("\n⚠️  Users table does not exist!")
        console.log("   Run 'npm run drizzle:push' to create tables.")
      }
      
      await sql.end()
    } catch (queryError) {
      console.error("\n❌ Query failed:", queryError)
      await sql.end()
      process.exit(1)
    }
  } catch (error) {
    console.error("\n❌ Connection failed:", error)
    if (error instanceof Error) {
      console.error("   Error message:", error.message)
    }
    process.exit(1)
  }
}

testConnection()
  .then(() => {
    console.log("\n✅ Test completed")
    process.exit(0)
  })
  .catch((err) => {
    console.error("❌ Test failed:", err)
    process.exit(1)
  })

