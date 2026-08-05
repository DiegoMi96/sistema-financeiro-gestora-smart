import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"
import { normalizeCnpj } from "@/lib/cnpj"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query")
  const cnpjDigits = query ? normalizeCnpj(query) : ""
  const skip  = parseInt(searchParams.get("skip") ?? "0")
  const limit = parseInt(searchParams.get("limit") ?? "25")

  // Se a busca tiver algum dígito, compara também pelo CNPJ normalizado (sem
  // pontuação) dos dois lados — assim funciona buscando formatado ou não,
  // e mesmo com registros antigos que ainda tenham pontuação salva.
  const [clients, countRow] = !query
    ? await Promise.all([
        sql`SELECT * FROM clients WHERE is_active = true ORDER BY name LIMIT ${limit} OFFSET ${skip}`,
        sql`SELECT COUNT(*)::int AS total FROM clients WHERE is_active = true`,
      ])
    : cnpjDigits
    ? await Promise.all([
        sql`
          SELECT * FROM clients
          WHERE is_active = true
            AND (LOWER(name) LIKE ${"%" + query.toLowerCase() + "%"} OR regexp_replace(cnpj, '\D', '', 'g') LIKE ${"%" + cnpjDigits + "%"})
          ORDER BY name
          LIMIT ${limit} OFFSET ${skip}
        `,
        sql`
          SELECT COUNT(*)::int AS total FROM clients
          WHERE is_active = true
            AND (LOWER(name) LIKE ${"%" + query.toLowerCase() + "%"} OR regexp_replace(cnpj, '\D', '', 'g') LIKE ${"%" + cnpjDigits + "%"})
        `,
      ])
    : await Promise.all([
        sql`
          SELECT * FROM clients
          WHERE is_active = true AND LOWER(name) LIKE ${"%" + query.toLowerCase() + "%"}
          ORDER BY name
          LIMIT ${limit} OFFSET ${skip}
        `,
        sql`
          SELECT COUNT(*)::int AS total FROM clients
          WHERE is_active = true AND LOWER(name) LIKE ${"%" + query.toLowerCase() + "%"}
        `,
      ])

  return NextResponse.json({ clients, total: countRow[0]?.total ?? 0 })
}

export async function POST(request: NextRequest) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const body = await request.json()

  const [client] = await sql`
    INSERT INTO clients (cnpj, name, consultant_name, phone, email, messaging_package, is_active)
    VALUES (${normalizeCnpj(body.cnpj)}, ${body.name ?? ""}, ${body.consultant_name ?? ""}, ${body.phone ?? ""}, ${body.email ?? ""}, ${body.messaging_package ?? ""}, true)
    RETURNING *
  `

  return NextResponse.json(client, { status: 201 })
}
