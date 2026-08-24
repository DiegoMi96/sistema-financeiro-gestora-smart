"""
Vencimento efetivo (dia útil) — usado só pra classificação/exibição local de
"vencido" vs "aguardando pagamento". Nunca altera o due_date real no
Asaas/Itaú nem no banco, só a leitura.

Pedido do Diego (24/08/2026): se o vencimento cair no sábado ou domingo, o
sistema não deve tratar como vencido até passar o próximo dia útil (segunda).
Não considera feriados — não há calendário de feriados no sistema.
"""
from datetime import date, timedelta
from typing import Optional


def effective_due_date(due_date: Optional[date]) -> Optional[date]:
    """Sábado empurra 2 dias (segunda), domingo empurra 1 dia (segunda)."""
    if due_date is None:
        return None
    weekday = due_date.weekday()  # Mon=0 ... Sat=5, Sun=6
    if weekday == 5:
        return due_date + timedelta(days=2)
    if weekday == 6:
        return due_date + timedelta(days=1)
    return due_date


def is_overdue(due_date: Optional[date], today: Optional[date] = None) -> bool:
    if due_date is None:
        return False
    today = today or date.today()
    return today > effective_due_date(due_date)


def is_overdue_iso(due_date_iso: Optional[str], today: Optional[date] = None) -> bool:
    """Mesma checagem, recebendo a data como string ISO (formato usado nos dicts de pagamento)."""
    if not due_date_iso:
        return False
    try:
        d = date.fromisoformat(due_date_iso[:10])
    except (ValueError, TypeError):
        return False
    return is_overdue(d, today)


def effective_due_date_sql(column: str) -> str:
    """
    Fragmento SQL com a mesma regra, pra usar dentro de text() em queries raw.
    `column` é sempre um nome/expressão de coluna fixo escrito por nós — nunca
    input do usuário — e é interpolado direto na string da query.
    """
    return (
        f"CASE EXTRACT(DOW FROM {column})::int "
        f"WHEN 6 THEN {column} + 2 "
        f"WHEN 0 THEN {column} + 1 "
        f"ELSE {column} END"
    )
