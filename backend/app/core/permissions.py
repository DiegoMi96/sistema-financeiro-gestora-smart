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
    "can_edit_organograma",
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
    # Faturamento — páginas visíveis (granular, 01/08/2026)
    "can_view_fat_ciclos",           # Lista de ciclos
    "can_view_fat_ciclo_detalhe",    # Detalhe do ciclo
    "can_view_fat_cliente_detalhe",  # Detalhe do cliente
    "can_view_fat_diagnostico_ia",   # Diagnóstico IA
    # Comissionamento — páginas visíveis (granular, 01/08/2026)
    "can_view_com_painel",           # Painel de comissionamento
    "can_view_com_parceiros",        # Parceiros regionais
    "can_view_com_interno",          # Comissionamento interno
    # Contestação — páginas visíveis (granular, 01/08/2026)
    "can_view_cont_ciclos",          # Lista de ciclos de contestação
    "can_view_cont_ciclo_detalhe",   # Detalhe do ciclo de contestação
    "can_view_cont_allcom",          # Allcom
    # SMT Dashboard externo
    "can_view_smt",
    # Guardião — controle de consumo de franquias (integrado 31/07/2026)
    "can_view_guardiao",
    # Guardião — páginas visíveis (granular, 31/07/2026)
    "can_view_grd_dashboard",        # Dashboard
    "can_view_grd_importacoes",      # Monitoramento > Histórico de Importes
    "can_view_grd_timeline",         # Monitoramento > Linha do Tempo
    "can_view_grd_analises",         # Monitoramento > Consumo Crítico
    "can_view_grd_envios",           # Monitoramento > Histórico de Envios
    "can_view_grd_nao_acionados",    # Monitoramento > Não Acionados
    "can_view_grd_upload",           # Importar Planilha
    "can_view_grd_alerts",           # Acionamentos
    "can_view_grd_history",          # Histórico de Acionamentos
    "can_view_grd_historico_mensal", # Histórico Mensal
    "can_view_grd_clientes",         # Cadastros > Clientes
    "can_view_grd_configuracoes",    # Regras de Consumo
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
        "can_edit_organograma":     True,
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
        "can_view_fat_ciclos":           True,
        "can_view_fat_ciclo_detalhe":    True,
        "can_view_fat_cliente_detalhe":  True,"can_view_fat_diagnostico_ia":   True,
        "can_view_com_painel":           True,
        "can_view_com_parceiros":        True,
        "can_view_com_interno":          True,
        "can_view_cont_ciclos":          True,
        "can_view_cont_ciclo_detalhe":   True,
        "can_view_cont_allcom":          True,
        "can_view_smt":              True,
        "can_view_guardiao":         True,
        "can_view_grd_dashboard":        True,
        "can_view_grd_importacoes":      True,
        "can_view_grd_timeline":         True,
        "can_view_grd_analises":         True,
        "can_view_grd_envios":           True,
        "can_view_grd_nao_acionados":    True,
        "can_view_grd_upload":           True,
        "can_view_grd_alerts":           True,
        "can_view_grd_history":          True,
        "can_view_grd_historico_mensal": True,
        "can_view_grd_clientes":         True,
        "can_view_grd_configuracoes":    True,
    },
    UserRole.GESTOR: {
        "can_view_dashboard":       True,
        "can_view_faturamento":     True,
        "can_edit_billing":         True,
        "can_view_contestacao":     True,
        "can_view_comissao":        True,
        "can_view_logistica":       True,
        "can_view_organograma":     True,
        "can_edit_organograma":     True,
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
        "can_view_fat_ciclos":           True,
        "can_view_fat_ciclo_detalhe":    True,
        "can_view_fat_cliente_detalhe":  True,"can_view_fat_diagnostico_ia":   True,
        "can_view_com_painel":           True,
        "can_view_com_parceiros":        True,
        "can_view_com_interno":          True,
        "can_view_cont_ciclos":          True,
        "can_view_cont_ciclo_detalhe":   True,
        "can_view_cont_allcom":          True,
        "can_view_smt":              True,
        "can_view_guardiao":         True,
        "can_view_grd_dashboard":        True,
        "can_view_grd_importacoes":      True,
        "can_view_grd_timeline":         True,
        "can_view_grd_analises":         True,
        "can_view_grd_envios":           True,
        "can_view_grd_nao_acionados":    True,
        "can_view_grd_upload":           True,
        "can_view_grd_alerts":           True,
        "can_view_grd_history":          True,
        "can_view_grd_historico_mensal": True,
        "can_view_grd_clientes":         True,
        "can_view_grd_configuracoes":    True,
    },
    UserRole.CONTAS_RECEBER: {
        "can_view_dashboard":       True,
        "can_view_faturamento":     True,
        "can_edit_billing":         True,
        "can_view_contestacao":     False,
        "can_view_comissao":        False,
        "can_view_logistica":       False,
        "can_view_organograma":     True,
        "can_edit_organograma":     False,
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
        "can_view_fat_ciclos":           True,
        "can_view_fat_ciclo_detalhe":    True,
        "can_view_fat_cliente_detalhe":  True,"can_view_fat_diagnostico_ia":   True,
        "can_view_com_painel":           False,
        "can_view_com_parceiros":        False,
        "can_view_com_interno":          False,
        "can_view_cont_ciclos":          False,
        "can_view_cont_ciclo_detalhe":   False,
        "can_view_cont_allcom":          False,
        "can_view_smt":              False,
        "can_view_guardiao":         False,
        "can_view_grd_dashboard":        False,
        "can_view_grd_importacoes":      False,
        "can_view_grd_timeline":         False,
        "can_view_grd_analises":         False,
        "can_view_grd_envios":           False,
        "can_view_grd_nao_acionados":    False,
        "can_view_grd_upload":           False,
        "can_view_grd_alerts":           False,
        "can_view_grd_history":          False,
        "can_view_grd_historico_mensal": False,
        "can_view_grd_clientes":         False,
        "can_view_grd_configuracoes":    False,
    },
    UserRole.SUPORTE_TECNICO: {
        "can_view_dashboard":       False,
        "can_view_faturamento":     False,
        "can_edit_billing":         False,
        "can_view_contestacao":     True,
        "can_view_comissao":        False,
        "can_view_logistica":       True,
        "can_view_organograma":     True,
        "can_edit_organograma":     False,
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
        "can_view_fat_ciclos":           False,
        "can_view_fat_ciclo_detalhe":    False,
        "can_view_fat_cliente_detalhe":  False,"can_view_fat_diagnostico_ia":   False,
        "can_view_com_painel":           False,
        "can_view_com_parceiros":        False,
        "can_view_com_interno":          False,
        "can_view_cont_ciclos":          True,
        "can_view_cont_ciclo_detalhe":   True,
        "can_view_cont_allcom":          True,
        "can_view_smt":              False,
        "can_view_guardiao":         False,
        "can_view_grd_dashboard":        False,
        "can_view_grd_importacoes":      False,
        "can_view_grd_timeline":         False,
        "can_view_grd_analises":         False,
        "can_view_grd_envios":           False,
        "can_view_grd_nao_acionados":    False,
        "can_view_grd_upload":           False,
        "can_view_grd_alerts":           False,
        "can_view_grd_history":          False,
        "can_view_grd_historico_mensal": False,
        "can_view_grd_clientes":         False,
        "can_view_grd_configuracoes":    False,
    },
    UserRole.LOGISTICA: {
        "can_view_dashboard":       False,
        "can_view_faturamento":     True,
        "can_edit_billing":         False,
        "can_view_contestacao":     False,
        "can_view_comissao":        False,
        "can_view_logistica":       True,
        "can_view_organograma":     True,
        "can_edit_organograma":     False,
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
        "can_view_fat_ciclos":           True,
        "can_view_fat_ciclo_detalhe":    True,
        "can_view_fat_cliente_detalhe":  True,"can_view_fat_diagnostico_ia":   True,
        "can_view_com_painel":           False,
        "can_view_com_parceiros":        False,
        "can_view_com_interno":          False,
        "can_view_cont_ciclos":          False,
        "can_view_cont_ciclo_detalhe":   False,
        "can_view_cont_allcom":          False,
        "can_view_smt":              False,
        "can_view_guardiao":         False,
        "can_view_grd_dashboard":        False,
        "can_view_grd_importacoes":      False,
        "can_view_grd_timeline":         False,
        "can_view_grd_analises":         False,
        "can_view_grd_envios":           False,
        "can_view_grd_nao_acionados":    False,
        "can_view_grd_upload":           False,
        "can_view_grd_alerts":           False,
        "can_view_grd_history":          False,
        "can_view_grd_historico_mensal": False,
        "can_view_grd_clientes":         False,
        "can_view_grd_configuracoes":    False,
    },
    UserRole.BACKOFFICE: {
        "can_view_dashboard":       True,
        "can_view_faturamento":     True,
        "can_edit_billing":         True,
        "can_view_contestacao":     False,
        "can_view_comissao":        False,
        "can_view_logistica":       False,
        "can_view_organograma":     True,
        "can_edit_organograma":     False,
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
        "can_view_fat_ciclos":           True,
        "can_view_fat_ciclo_detalhe":    True,
        "can_view_fat_cliente_detalhe":  True,"can_view_fat_diagnostico_ia":   True,
        "can_view_com_painel":           False,
        "can_view_com_parceiros":        False,
        "can_view_com_interno":          False,
        "can_view_cont_ciclos":          False,
        "can_view_cont_ciclo_detalhe":   False,
        "can_view_cont_allcom":          False,
        "can_view_smt":              False,
        "can_view_guardiao":         False,
        "can_view_grd_dashboard":        False,
        "can_view_grd_importacoes":      False,
        "can_view_grd_timeline":         False,
        "can_view_grd_analises":         False,
        "can_view_grd_envios":           False,
        "can_view_grd_nao_acionados":    False,
        "can_view_grd_upload":           False,
        "can_view_grd_alerts":           False,
        "can_view_grd_history":          False,
        "can_view_grd_historico_mensal": False,
        "can_view_grd_clientes":         False,
        "can_view_grd_configuracoes":    False,
    },
    UserRole.COMERCIAL: {
        "can_view_dashboard":       True,
        "can_view_faturamento":     True,
        "can_edit_billing":         False,
        "can_view_contestacao":     False,
        "can_view_comissao":        True,
        "can_view_logistica":       False,
        "can_view_organograma":     True,
        "can_edit_organograma":     False,
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
        "can_view_fat_ciclos":           True,
        "can_view_fat_ciclo_detalhe":    True,
        "can_view_fat_cliente_detalhe":  True,"can_view_fat_diagnostico_ia":   True,
        "can_view_com_painel":           True,
        "can_view_com_parceiros":        True,
        "can_view_com_interno":          True,
        "can_view_cont_ciclos":          False,
        "can_view_cont_ciclo_detalhe":   False,
        "can_view_cont_allcom":          False,
        "can_view_smt":              False,
        "can_view_guardiao":         False,
        "can_view_grd_dashboard":        False,
        "can_view_grd_importacoes":      False,
        "can_view_grd_timeline":         False,
        "can_view_grd_analises":         False,
        "can_view_grd_envios":           False,
        "can_view_grd_nao_acionados":    False,
        "can_view_grd_upload":           False,
        "can_view_grd_alerts":           False,
        "can_view_grd_history":          False,
        "can_view_grd_historico_mensal": False,
        "can_view_grd_clientes":         False,
        "can_view_grd_configuracoes":    False,
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
