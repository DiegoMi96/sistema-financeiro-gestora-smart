import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireMainAuth, unauthorizedResponse } from "@/lib/mainAuth"

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireMainAuth(request))) return unauthorizedResponse()

  const [line] = await sql`SELECT * FROM skipped_lines WHERE id = ${params.id}`
  if (!line) return NextResponse.json({ detail: "Linha não encontrada" }, { status: 404 })

  // Grava o registro em audit_logs ANTES de apagar — a linha some da tela,
  // mas fica rastreável quem/quando/qual linha foi encaminhada pra análise.
  await sql`
    INSERT INTO audit_logs (action, entity_type, entity_id, details)
    VALUES ('skipped_line_forwarded', 'skipped_line', ${params.id},
      ${JSON.stringify({
        line_number:      line.line_number,
        client_name:      line.client_name,
        cpf_cnpj:         line.cpf_cnpj,
        operator:         line.operator,
        usage_percentage: line.usage_percentage,
        competencia:      line.competencia,
      })}::jsonb)
  `

  await sql`DELETE FROM skipped_lines WHERE id = ${params.id}`

  return NextResponse.json({ id: params.id, deleted: true })
}
