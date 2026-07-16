"""
Sistema de permissões — Gestora Smart

Cada perfil tem um conjunto padrão de permissões.
Permissões individuais no model User sobrescrevem o padrão do perfil.
Overrides por perfil são armazenados em system_settings como JSON.
"""
import json
from app.models import UserRole

# ─────────────────────────────────────────────
# TODAS AS PERMISSÕES DISPONÍVEIS
# ─────────────────────────────────────────────
ALL_PERMISSIONS = [
    # MÓDULOS
    "can_view_dashboard",
    "can_view_faturamento",
    "can_edit_billing",
    "can_view_contestacao",
    "can_view_comissao",
    "can_view_logistica",
    "can_view_organograma",
    "can_view_controladoria",
    "can_manage_users",
    "can_view_configuracoes",
    # AÇÕES
    "can_approve_billing",
    "can_create_adjustment",
    "can_approve_adjustment",
    "can_upload_files",
    "can_sync_asaas",
    # DADOS SENSÍVEIS
    "can_view_financial_values",
    # EXPORTAÇÃO
    "can_export_excel",
    "can_export_pdf",
    # CONTROLADORIA — abas do dashboard
    "can_view_ctrl_indicadores",   # Resumo Executivo
    "can_view_ctrl_dre",           # Resumo Financeiro
    "can_view_ctrl_sales",         # Vendas & Performance
    "can_view_ctrl_ops",           # Operação
    "can_view_ctrl_logistics",     # Logística
    "can_view_ctrl_rh",            # RH
    "can_view_ctrl_fluxo_caixa",   # DFC Gerencial
    # SMT Dashboard externo
    "can_view_smt",
]

# ─────────────────────────────────────────────
# PERMISSÕES PADRÃO POR PERFIL (hardcoded)
# ─────────────────────────────────────────────
ROLE_PERMISSIONS: dict[UserRole, dict[str, bool]] = {
    UserRole.ADMIN: {
        "can_view_dashboard":       True,
        "can_view_faturamento":     True,
        "can_edit_billing":         True,
        "can_view_contestacao":     True,
        "can_view_comissao":        True,
        "can_view_logistica":       True,
        "can_view_organograma":     True,
        "can_view_controladoria":   True,
        "can_manage_users":         True,
        "can_view_configuracoes":   True,
        "can_approve_billing":      True,
        "can_create_adjustment":    True,
        "can_approve_adjustment":   True,
        "can_upload_files":         True,
        "can_sync_asaas":           True,
        "can_view_financial_values":True,
        "can_export_excel":         True,
        "can_export_pdf":           True,
        "can_view_ctrl_indicadores": True,
        "can_view_ctrl_dre":         True,
        "can_view_ctrl_sales":       True,
        "can_view_ctrl_ops":         True,
        "can_view_ctrl_logistics":   True,
        "can_view_ctrl_rh":          True,
        "can_view_ctrl_fluxo_caixa": True,
        "can_view_smt":              True,
    },
    UserRole.GESTOR: {
        "can_view_dashboard":       True,
        "can_view_faturamento":     True,
        "can_edit_billing":         True,
        "can_view_contestacao":     True,
        "can_view_comissao":        True,
        "can_view_logistica":       True,
        "can_view_organograma":     True,
        "can_view_controladoria":   True,
        "can_manage_users":         False,
        "can_view_configuracoes":   True,
        "can_approve_billing":      True,
        "can_create_adjustment":    False,
        "can_approve_adjustment":   True,
        "can_upload_files":         False,
        "can_sync_asaas":           True,
        "can_view_financial_values":True,
        "can_export_excel":         True,
        "can_export_pdf":           True,
        "can_view_ctrl_indicadores": True,
        "can_view_ctrl_dre":         True,
        "can_view_ctrl_sales":       True,
        "can_view_ctrl_ops":         True,
        "can_view_ctrl_logistics":   True,
        "can_view_ctrl_rh":          True,
        "can_view_ctrl_fluxo_caixa": True,
        "can_view_smt":              True,
    },
    UserRole.CONTAS_RECEBER: {
        "can_view_dashboard":       True,
        "can_view_faturamento":     True,
        "can_edit_billing":         True,
        "can_view_contestacao":     False,
        "can_view_comissao":        False,
        "can_view_logistica":       False,
        "can_view_organograma":     True,
        "can_view_controladoria":   False,
        "can_manage_users":         False,
        "can_view_configuracoes":   False,
        "can_approve_billing":      False,
        "can_create_adjustment":    True,
        "can_approve_adjustment":   False,
        "can_upload_files":         True,
        "can_sync_asaas":           False,
        "can_view_financial_values":True,
        "can_export_excel":         True,
        "can_export_pdf":           False,
        "can_view_ctrl_indicadores": False,
        "can_view_ctrl_dre":         False,
        "can_view_ctrl_sales":       False,
        "can_view_ctrl_ops":         False,
        "can_view_ctrl_logistics":   False,
        "can_view_ctrl_rh":          False,
        "can_view_ctrl_fluxo_caixa": False,
        "can_view_smt":              False,
    },
    UserRole.SUPORTE_TECNICO: {
        "can_view_dashboard":       False,
        "can_view_faturamento":     False,
        "can_edit_billing":         False,
        "can_view_contestacao":     True,
        "can_view_comissao":        False,
        "can_view_logistica":       True,
        "can_view_organograma":     True,
        "can_view_controladoria":   False,
        "can_manage_users":         False,
        "can_view_configuracoes":   False,
        "can_approve_billing":      False,
        "can_create_adjustment":    False,
        "can_approve_adjustment":   False,
        "can_upload_files":         False,
        "can_sync_asaas":           False,
        "can_view_financial_values":False,
        "can_export_excel":         False,
        "can_export_pdf":           False,
        "can_view_ctrl_indicadores": False,
        "can_view_ctrl_dre":         False,
        "can_view_ctrl_sales":       False,
        "can_view_ctrl_ops":         False,
        "can_view_ctrl_logistics":   False,
        "can_view_ctrl_rh":          False,
        "can_view_ctrl_fluxo_caixa": False,
        "can_view_smt":              False,
    },
    UserRole.LOGISTICA: {
        "can_view_dashboard":       False,
        "can_view_faturamento":     True,
        "can_edit_billing":         False,
        "can_view_contestacao":     False,
        "can_view_comissao":        False,
        "can_view_logistica":       True,
        "can_view_organograma":     True,
        "can_view_controladoria":   False,
        "can_manage_users":         False,
        "can_view_configuracoes":   False,
        "can_approve_billing":      False,
        "can_create_adjustment":    False,
        "can_approve_adjustment":   False,
        "can_upload_files":         True,
        "can_sync_asaas":           False,
        "can_view_financial_values":False,
        "can_export_excel":         True,
        "can_export_pdf":           False,
        "can_view_ctrl_indicadores": False,
        "can_view_ctrl_dre":         False,
        "can_view_ctrl_sales":       False,
        "can_view_ctrl_ops":         False,
        "can_view_ctrl_logistics":   False,
        "can_view_ctrl_rh":          False,
        "can_view_ctrl_fluxo_caixa": False,
        "can_view_smt":              False,
    },
    UserRole.BACKOFFICE: {
        "can_view_dashboard":       True,
        "can_view_faturamento":     True,
        "can_edit_billing":         True,
        "can_view_contestacao":     False,
        "can_view_comissao":        False,
        "can_view_logistica":       False,
        "can_view_organograma":     True,
        "can_view_controladoria":   False,
        "can_manage_users":         False,
        "can_view_configuracoes":   False,
        "can_approve_billing":      False,
        "can_create_adjustment":    True,
        "can_approve_adjustment":   False,
        "can_upload_files":         True,
        "can_sync_asaas":           False,
        "can_view_financial_values":True,
        "can_export_excel":         True,
        "can_export_pdf":           False,
        "can_view_ctrl_indicadores": False,
        "can_view_ctrl_dre":         False,
        "can_view_ctrl_sales":       False,
        "can_view_ctrl_ops":         False,
        "can_view_ctrl_logistics":   False,
        "can_view_ctrl_rh":          False,
        "can_view_ctrl_fluxo_caixa": False,
        "can_view_smt":              False,
    },
    UserRole.COMERCIAL: {
        "can_view_dashboard":       True,
        "can_view_faturamento":     True,
        "can_edit_billing":         False,
        "can_view_contestacao":     False,
        "can_view_comissao":        True,
        "can_view_logistica":       False,
        "can_view_organograma":     True,
        "can_view_controladoria":   False,
        "can_manage_users":         False,
        "can_view_configuracoes":   False,
        "can_approve_billing":      False,
        "can_create_adjustment":    False,
        "can_approve_adjustment":   False,
        "can_upload_files":         False,
        "can_sync_asaas":           False,
        "can_view_financial_values":True,
        "can_export_excel":         False,
        "can_export_pdf":           False,
        "can_view_ctrl_indicadores": False,
        "can_view_ctrl_dre":         False,
        "can_view_ctrl_sales":       False,
        "can_view_ctrl_ops":         False,
        "can_view_ctrl_logistics":   False,
        "can_view_ctrl_rh":          False,
        "can_view_ctrl_fluxo_caixa": False,
        "can_view_smt":              False,
    },
}

# Nome amigável de cada perfil
ROLE_LABELS = {
    UserRole.ADMIN:           "Administrador",
    UserRole.GESTOR:          "Diretoria / Analista Administrativo",
    UserRole.CONTAS_RECEBER:  "Analista Financeiro",
    UserRole.SUPORTE_TECNICO: "Suporte Técnico",
    UserRole.LOGISTICA:       "Logística",
    UserRole.BACKOFFICE:      "Backoffice",
    UserRole.COMERCIAL:       "Comercial",
}

ROLE_DESCRIPTIONS = {
    "admin":           "Acesso completo a todas as funcionalidades do sistema.",
    "gestor":          "Diretoria e Analista Administrativo — Controladoria, faturamento, aprovações e relatórios gerenciais.",
    "contas_receber":  "Analista Financeiro — faturamento, ajustes e exportações.",
    "suporte_tecnico": "Suporte Técnico — acesso somente à contestação e logística.",
    "logistica":       "Logística — gestão de fretes e upload de planilhas.",
    "backoffice":      "Backoffice — operações internas, faturamento e ajustes.",
    "comercial":       "Comercial — comissionamento e painel de resultados.",
}


def _get_custom_role_permissions(role_key: str, db) -> dict | None:
    """Busca permissões de um perfil personalizado armazenado em system_settings."""
    try:
        from app.routers.settings import SystemSetting
        row = db.query(SystemSetting).filter(SystemSetting.key == "custom_roles").first()
        if row and row.value:
            for cr in json.loads(row.value):
                if cr.get("slug") == role_key:
                    return cr.get("permissions", {})
    except Exception:
        pass
    return None


def _get_role_override(role_str: str, db=None) -> dict | None:
    """
    Busca override de permissões do perfil no system_settings.
    Retorna dict de permissões ou None se não houver override.
    """
    if db is None:
        return None
    try:
        from app.routers.settings import SystemSetting
        key = f"role_perm_{role_str}"
        row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if row and row.value:
            return json.loads(row.value)
    except Exception:
        pass
    return None


def get_permission(user, permission: str, db=None) -> bool:
    """
    Retorna se o usuário tem a permissão solicitada.
    Ordem de precedência:
    1. Override individual no modelo User
    2. Override de perfil em system_settings (se db fornecido)
    3. Padrão hardcoded do perfil
    """
    # 1. Override individual no modelo User
    individual = getattr(user, permission, None)
    if individual is not None:
        return individual

    # 2. Perfil personalizado (custom_role_key sobrescreve o role padrão)
    custom_role_key = getattr(user, "custom_role_key", None)
    if custom_role_key and db is not None:
        custom_perms = _get_custom_role_permissions(custom_role_key, db)
        if custom_perms is not None:
            return custom_perms.get(permission, False)

    role_str = user.role.value if hasattr(user.role, 'value') else str(user.role)

    # 3. Override de perfil em system_settings
    if db is not None:
        override = _get_role_override(role_str, db)
        if override is not None:
            return override.get(permission, False)

    # 4. Padrão hardcoded
    role_defaults = ROLE_PERMISSIONS.get(user.role, {})
    return role_defaults.get(permission, False)


def require_permission(permission: str):
    """
    Decorator / dependência FastAPI para proteger rotas por permissão.
    Uso: Depends(require_permission("can_approve_billing"))
    """
    from fastapi import Depends, HTTPException, status
    from app.routers.auth import get_current_user

    def dependency(current_user=Depends(get_current_user)):
        if not get_permission(current_user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Sem permissão: {permission}",
            )
        return current_user

    return dependency
