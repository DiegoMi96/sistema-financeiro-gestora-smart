import { neon } from "@neondatabase/serverless"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definida no .env.local")
}

export const sql = neon(process.env.DATABASE_URL)
