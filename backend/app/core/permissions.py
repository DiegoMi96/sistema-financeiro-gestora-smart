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
    # Controle de Estoque — chips SMART/SMT (integrado 20/08/2026)
    "can_view_estoque",
    "can_view_est_dashboard",  # Estoque > Dashboard
    "can_view_est_geral",  # Estoque > Estoque Geral
    "can_view_est_smart",  # Estoque > Estoque SMART
    "can_view_est_smt",  # Estoque > Estoque SMT
    "can_view_est_upload",  # Estoque > Upload de planilhas
    "can_view_est_saida_dashboard",  # Controle de Saída > Dashboard
    "can_view_est_saida_resumo",  # Controle de Saída > Resumo por operadora
    "can_view_est_saida_dia",  # Controle de Saída > Saída do dia
    "can_view_est_saida_retornos",  # Controle de Saída > Retornos e Reenvios
    "can_view_est_canc_dashboard",  # Controle de Cancelamento > Dashboard
    "can_view_est_canc_multa",  # Controle de Cancelamento > Multa Contratual
    "can_view_est_config",  # Configurações
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
        "can_view_estoque":          True,
        "can_view_est_dashboard": True,  # Estoque > Dashboard
        "can_view_est_geral": True,  # Estoque > Estoque Geral
        "can_view_est_smart": True,  # Estoque > Estoque SMART
        "can_view_est_smt": True,  # Estoque > Estoque SMT
        "can_view_est_upload": True,  # Estoque > Upload de planilhas
        "can_view_est_saida_dashboard": True,  # Controle de Saída > Dashboard
        "can_view_est_saida_resumo": True,  # Controle de Saída > Resumo por operadora
        "can_view_est_saida_dia": True,  # Controle de Saída > Saída do dia
        "can_view_est_saida_retornos": True,  # Controle de Saída > Retornos e Reenvios
        "can_view_est_canc_dashboard": True,  # Controle de Cancelamento > Dashboard
        "can_view_est_canc_multa": True,  # Controle de Cancelamento > Multa Contratual
        "can_view_est_config": True,  # Configurações
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
        "can_view_estoque":          True,
        "can_view_est_dashboard": True,  # Estoque > Dashboard
        "can_view_est_geral": True,  # Estoque > Estoque Geral
        "can_view_est_smart": True,  # Estoque > Estoque SMART
        "can_view_est_smt": True,  # Estoque > Estoque SMT
        "can_view_est_upload": True,  # Estoque > Upload de planilhas
        "can_view_est_saida_dashboard": True,  # Controle de Saída > Dashboard
        "can_view_est_saida_resumo": True,  # Controle de Saída > Resumo por operadora
        "can_view_est_saida_dia": True,  # Controle de Saída > Saída do dia
        "can_view_est_saida_retornos": True,  # Controle de Saída > Retornos e Reenvios
        "can_view_est_canc_dashboard": True,  # Controle de Cancelamento > Dashboard
        "can_view_est_canc_multa": True,  # Controle de Cancelamento > Multa Contratual
        "can_view_est_config": True,  # Configurações
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
        "can_view_estoque":          False,
        "can_view_est_dashboard": False,  # Estoque > Dashboard
        "can_view_est_geral": False,  # Estoque > Estoque Geral
        "can_view_est_smart": False,  # Estoque > Estoque SMART
        "can_view_est_smt": False,  # Estoque > Estoque SMT
        "can_view_est_upload": False,  # Estoque > Upload de planilhas
        "can_view_est_saida_dashboard": False,  # Controle de Saída > Dashboard
        "can_view_est_saida_resumo": False,  # Controle de Saída > Resumo por operadora
        "can_view_est_saida_dia": False,  # Controle de Saída > Saída do dia
        "can_view_est_saida_retornos": False,  # Controle de Saída > Retornos e Reenvios
        "can_view_est_canc_dashboard": False,  # Controle de Cancelamento > Dashboard
        "can_view_est_canc_multa": False,  # Controle de Cancelamento > Multa Contratual
        "can_view_est_config": False,  # Configurações
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
        "can_view_estoque":          False,
        "can_view_est_dashboard": False,  # Estoque > Dashboard
        "can_view_est_geral": False,  # Estoque > Estoque Geral
        "can_view_est_smart": False,  # Estoque > Estoque SMART
        "can_view_est_smt": False,  # Estoque > Estoque SMT
        "can_view_est_upload": False,  # Estoque > Upload de planilhas
        "can_view_est_saida_dashboard": False,  # Controle de Saída > Dashboard
        "can_view_est_saida_resumo": False,  # Controle de Saída > Resumo por operadora
        "can_view_est_saida_dia": False,  # Controle de Saída > Saída do dia
        "can_view_est_saida_retornos": False,  # Controle de Saída > Retornos e Reenvios
        "can_view_est_canc_dashboard": False,  # Controle de Cancelamento > Dashboard
        "can_view_est_canc_multa": False,  # Controle de Cancelamento > Multa Contratual
        "can_view_est_config": False,  # Configurações
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
        "can_view_estoque":          False,
        "can_view_est_dashboard": False,  # Estoque > Dashboard
        "can_view_est_geral": False,  # Estoque > Estoque Geral
        "can_view_est_smart": False,  # Estoque > Estoque SMART
        "can_view_est_smt": False,  # Estoque > Estoque SMT
        "can_view_est_upload": False,  # Estoque > Upload de planilhas
        "can_view_est_saida_dashboard": False,  # Controle de Saída > Dashboard
        "can_view_est_saida_resumo": False,  # Controle de Saída > Resumo por operadora
        "can_view_est_saida_dia": False,  # Controle de Saída > Saída do dia
        "can_view_est_saida_retornos": False,  # Controle de Saída > Retornos e Reenvios
        "can_view_est_canc_dashboard": False,  # Controle de Cancelamento > Dashboard
        "can_view_est_canc_multa": False,  # Controle de Cancelamento > Multa Contratual
        "can_view_est_config": False,  # Configurações
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
        "can_view_estoque":          False,
        "can_view_est_dashboard": False,  # Estoque > Dashboard
        "can_view_est_geral": False,  # Estoque > Estoque Geral
        "can_view_est_smart": False,  # Estoque > Estoque SMART
        "can_view_est_smt": False,  # Estoque > Estoque SMT
        "can_view_est_upload": False,  # Estoque > Upload de planilhas
        "can_view_est_saida_dashboard": False,  # Controle de Saída > Dashboard
        "can_view_est_saida_resumo": False,  # Controle de Saída > Resumo por operadora
        "can_view_est_saida_dia": False,  # Controle de Saída > Saída do dia
        "can_view_est_saida_retornos": False,  # Controle de Saída > Retornos e Reenvios
        "can_view_est_canc_dashboard": False,  # Controle de Cancelamento > Dashboard
        "can_view_est_canc_multa": False,  # Controle de Cancelamento > Multa Contratual
        "can_view_est_config": False,  # Configurações
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
        "can_view_estoque":          False,
        "can_view_est_dashboard": False,  # Estoque > Dashboard
        "can_view_est_geral": False,  # Estoque > Estoque Geral
        "can_view_est_smart": False,  # Estoque > Estoque SMART
        "can_view_est_smt": False,  # Estoque > Estoque SMT
        "can_view_est_upload": False,  # Estoque > Upload de planilhas
        "can_view_est_saida_dashboard": False,  # Controle de Saída > Dashboard
        "can_view_est_saida_resumo": False,  # Controle de Saída > Resumo por operadora
        "can_view_est_saida_dia": False,  # Controle de Saída > Saída do dia
        "can_view_est_saida_retornos": False,  # Controle de Saída > Retornos e Reenvios
        "can_view_est_canc_dashboard": False,  # Controle de Cancelamento > Dashboard
        "can_view_est_canc_multa": False,  # Controle de Cancelamento > Multa Contratual
        "can_view_est_config": False,  # Configurações
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

# ─────────────────────────────────────────────
# ÁREAS E GESTÃO RESTRITA (01/08/2026)
# ─────────────────────────────────────────────
# Um "gestor de área" tem can_manage_users=True mas só pode gerenciar
# usuários/perfis dentro da própria área (ex.: Thalles como Gestor de
# Operações mexe só em Suporte Técnico + Logística; quem cria/edita
# Administrador ou outro Gestor continua sendo só o Admin geral).
# tier: "admin" (irrestrito) | "gestor" (gerencia usuários da própria área,
# se area != None) | "analista" (operacional, não gerencia usuários).
AREAS = ("administrativo", "comercial", "operacoes")

ROLE_AREA = {
    UserRole.ADMIN:           None,   # irrestrito
    UserRole.GESTOR:          None,   # perfil "Diretoria" — global, não amarrado a uma área
    UserRole.CONTAS_RECEBER:  "administrativo",
    UserRole.SUPORTE_TECNICO: "operacoes",
    UserRole.LOGISTICA:       "operacoes",
    UserRole.BACKOFFICE:      "administrativo",
    UserRole.COMERCIAL:       "comercial",
}

ROLE_TIER = {
    UserRole.ADMIN:           "admin",
    UserRole.GESTOR:          "gestor",
    UserRole.CONTAS_RECEBER:  "analista",
    UserRole.SUPORTE_TECNICO: "analista",
    UserRole.LOGISTICA:       "analista",
    UserRole.BACKOFFICE:      "analista",
    UserRole.COMERCIAL:       "analista",
}


# Quais permissões (chaves de ALL_PERMISSIONS) um gestor de área pode ver e
# alterar ao editar/criar o perfil de um Analista da própria área. Curado com
# o Diego em 01/08/2026 — ele testou como o "Gestor de Operações" via a tela
# e definiu explicitamente que Contestação NÃO é operações (mesmo o role
# nativo Suporte Técnico tendo can_view_contestacao=True por padrão hoje).
# Mesmas chaves de seção usadas em PERM_SECTIONS no frontend (AcessosPage.jsx)
# — se uma seção nova for adicionada lá, replicar aqui também.
MODULE_PERMISSIONS = {
    "FATURAMENTO": [
        "can_view_faturamento", "can_view_fat_ciclos", "can_view_fat_ciclo_detalhe",
        "can_view_fat_cliente_detalhe", "can_edit_billing", "can_view_fat_diagnostico_ia",
        "can_approve_billing", "can_create_adjustment", "can_approve_adjustment",
        "can_upload_files", "can_sync_asaas", "can_view_financial_values",
        "can_export_excel", "can_export_pdf",
    ],
    "COMISSIONAMENTO": [
        "can_view_comissao", "can_view_com_painel", "can_view_com_parceiros", "can_view_com_interno",
    ],
    "CONTESTAÇÃO": [
        "can_view_contestacao", "can_view_cont_ciclos", "can_view_cont_ciclo_detalhe", "can_view_cont_allcom",
    ],
    "GUARDIÃO": [
        "can_view_guardiao", "can_view_grd_dashboard", "can_view_grd_importacoes",
        "can_view_grd_timeline", "can_view_grd_analises", "can_view_grd_envios",
        "can_view_grd_nao_acionados", "can_view_grd_upload", "can_view_grd_alerts",
        "can_view_grd_history", "can_view_grd_historico_mensal", "can_view_grd_clientes",
        "can_view_grd_configuracoes",
    ],
    "CONTROLADORIA": [
        "can_view_controladoria", "can_view_ctrl_indicadores", "can_view_ctrl_dre",
        "can_view_ctrl_sales", "can_view_ctrl_ops", "can_view_ctrl_logistics",
        "can_view_ctrl_rh", "can_view_ctrl_fluxo_caixa",
    ],
    "LOGÍSTICA": ["can_view_logistica"],
    "ORGANOGRAMA": ["can_view_organograma", "can_edit_organograma"],
    "SMT": ["can_view_smt"],
    "ESTOQUE": ["can_view_estoque", "can_view_est_dashboard", "can_view_est_geral", "can_view_est_smart", "can_view_est_smt", "can_view_est_upload", "can_view_est_saida_dashboard", "can_view_est_saida_resumo", "can_view_est_saida_dia", "can_view_est_saida_retornos", "can_view_est_canc_dashboard", "can_view_est_canc_multa", "can_view_est_config"],
    # GERAL (can_view_dashboard/can_manage_users/can_view_configuracoes) fica
    # DE FORA de propósito — nenhuma área dá a um gestor restrito o poder de
    # conceder can_manage_users pra um analista dele (viraria um "gestor
    # fantasma" sem passar pela regra de só-Admin-cria-Gestor).
}

AREA_MODULES = {
    "operacoes":      ["LOGÍSTICA", "ORGANOGRAMA", "GUARDIÃO", "ESTOQUE"],
    "comercial":      ["COMISSIONAMENTO"],
    "administrativo": ["FATURAMENTO"],
}


def allowed_permission_keys_for_scope(scope: str | None) -> set[str] | None:
    """
    Conjunto de chaves de permissão que um gestor de área pode ver/alterar.
    None = irrestrito (Admin ou gestor global, ex. perfil "Diretoria").
    """
    if scope is None:
        return None
    keys = set()
    for module in AREA_MODULES.get(scope, []):
        keys.update(MODULE_PERMISSIONS.get(module, []))
    return keys


def _get_custom_role_meta(role_key: str, db) -> dict | None:
    """Busca o objeto completo (label/area/tier/permissions/...) de um perfil personalizado."""
    try:
        from app.routers.settings import SystemSetting
        row = db.query(SystemSetting).filter(SystemSetting.key == "custom_roles").first()
        if row and row.value:
            for cr in json.loads(row.value):
                if cr.get("slug") == role_key:
                    return cr
    except Exception:
        pass
    return None


def resolve_area_tier(role: "UserRole", custom_role_key: str | None, db) -> tuple[str | None, str]:
    """Resolve (área, tier) de um role/perfil. Perfil personalizado sobrescreve o role base
    (mesma precedência usada em get_permission). tier default 'analista' se ausente."""
    if custom_role_key and db is not None:
        cr = _get_custom_role_meta(custom_role_key, db)
        if cr is not None:
            return cr.get("area"), cr.get("tier") or "analista"
    return ROLE_AREA.get(role), ROLE_TIER.get(role, "analista")


def get_manager_scope(user, db) -> str | None:
    """
    Área de atuação de um gestor restrito, ou None se tem acesso irrestrito
    (Admin, ou qualquer perfil/role marcado com area=None). Só faz sentido
    chamar depois de confirmar que o usuário tem can_manage_users=True.
    """
    if user.role == UserRole.ADMIN:
        return None
    area, _tier = resolve_area_tier(user.role, getattr(user, "custom_role_key", None), db)
    return area


def target_in_scope(scope: str, target_role: "UserRole", target_custom_role_key: str | None, db) -> bool:
    """True se o role/perfil-alvo está dentro do escopo de um gestor de área
    (mesma área E tier 'analista' — gestor de área nunca cria/edita outro gestor)."""
    area, tier = resolve_area_tier(target_role, target_custom_role_key, db)
    return area == scope and tier == "analista"


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
    from app.database import get_db

    def dependency(current_user=Depends(get_current_user), db=Depends(get_db)):
        # Bug corrigido em 01/08/2026: sem passar `db`, overrides de perfil
        # personalizado ou de system_settings nunca eram resolvidos aqui —
        # toda checagem caía silenciosamente no ROLE_PERMISSIONS hardcoded do
        # role nativo do usuário, ignorando qualquer perfil customizado.
        if not get_permission(current_user, permission, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Sem permissão: {permission}",
            )
        return current_user

    return dependency
