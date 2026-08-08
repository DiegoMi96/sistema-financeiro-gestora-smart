import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useModule } from '../../contexts/ModuleContext'
import api from '../../services/api'
import {
  LayoutDashboard, FileText, Users, LogOut,
  LayoutGrid, AlertCircle, TrendingUp,
  Settings, SlidersHorizontal, Menu, ChevronRight, ChevronLeft,
  Truck, BarChart2, LineChart, Contact, Brain, UserCog
} from 'lucide-react'

const NAV_ICONS = {
  '/faturamento':                 FileText,
  '/clientes':        Contact,
  '/ajustes':         SlidersHorizontal,
  '/contestacao':     AlertCircle,
  '/comissionamento': TrendingUp,
  '/logistica':       Truck,
  '/controladoria':   BarChart2,
  '/dashboard':       LayoutDashboard,
  '/usuarios':        Users,
  '/configuracoes':   Settings,
  '/diagnostico-ia':  Brain,
  '/organograma':                Users,
  '/organograma/gerenciar':      UserCog,
  '/controladoria/indicadores':  LineChart,
}

const NAV_SECTIONS = {
  '/dashboard':                   'PAINÉIS',
  '/faturamento':                 'MÓDULOS',
  '/clientes':                    'MÓDULOS',
  '/ajustes':                     'MÓDULOS',
  '/diagnostico-ia':              'MÓDULOS',
  '/contestacao':                 'MÓDULOS',
  '/comissionamento':             'MÓDULOS',
  '/logistica':                   'MÓDULOS',
  '/controladoria':               'MÓDULOS',
  '/usuarios':                    'CONFIGURAÇÕES',
  '/configuracoes':               'CONFIGURAÇÕES',
}

const PAGE_TITLES = {
  '/faturamento':     'Faturamento',
  '/clientes':        'Clientes',
  '/ajustes':         'Ajustes',
  '/dashboard':       'Dashboard',
  '/usuarios':        'Usuários',
  '/configuracoes':   'Configurações',
  '/contestacao':     'Contestação',
  '/comissionamento': 'Comissionamento',
}

const BG  = '#0D0D0D'
const BDR = '1px solid #1F1F1F'
const GRN = '#3CB54A'

export default function Layout() {
  const { user, logout, can } = useAuth()
  const { currentModule, availableModules, clearModule } = useModule()
  const navigate  = useNavigate()
  const location  = useLocation()

  const { data: appCfg } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data),
    staleTime: 1000 * 60 * 10,
    retry: false,
  })
  const companyLogo = appCfg?.empresa_logo || null

  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed,  setCollapsed]  = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )
  // showText defasado: some imediatamente ao recolher, aparece só após a sidebar abrir
  const [showText, setShowText] = useState(!collapsed)

  const toggleCollapsed = () =>
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar_collapsed', String(next))
      if (next) {
        setShowText(false)           // recolhendo: some o texto na hora
      } else {
        setTimeout(() => setShowText(true), 160)  // expandindo: aguarda animação
      }
      return next
    })

  const handleLogout = () => { logout(); navigate('/login') }

  // pageBase = primeiro segmento da rota (ex.: '/controladoria')
  const pageBase  = '/' + location.pathname.split('/')[1]

  // Módulo efetivo do menu: derivado da URL, não apenas do módulo salvo na
  // sessão. Sem isto, após um F5 o menu podia mostrar um módulo (ex.:
  // Faturamento) enquanto o conteúdo era de outro (ex.: Controladoria /
  // Indicadores), porque o módulo ativo vinha do sessionStorage e podia estar
  // dessincronizado da rota. Regra: se a rota pertence a UM único módulo,
  // segue esse módulo; se é compartilhada (ex.: /faturamento e /clientes
  // aparecem em vários módulos), mantém o módulo ativo atual.
  const routeOwners = availableModules.filter(m =>
    (m.nav || []).some(item => ('/' + item.to.split('/')[1]) === pageBase)
  )
  const effectiveModule =
    routeOwners.length === 1
      ? routeOwners[0]
      : (routeOwners.find(m => m.id === currentModule?.id) || routeOwners[0] || currentModule)

  const navItems = effectiveModule?.nav || []
  const grouped  = navItems.reduce((acc, item) => {
    if (item.permission && !can(item.permission)) return acc
    if (item.roles    && !item.roles.includes(user?.role)) return acc
    const section = NAV_SECTIONS[item.to] || 'MENU'
    if (!acc[section]) acc[section] = []
    acc[section].push(item)
    return acc
  }, {})

  const pageTitle = PAGE_TITLES[pageBase] || effectiveModule?.label || ''
  const initials  = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  // Atenção: as strings 'lg:!w-14' e 'w-56' devem aparecer completas para o Tailwind não purgar
  const sidebarW = collapsed ? 'lg:!w-14' : ''   // mobile always w-56

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F5F5F5' }}>

      {/* ── Backdrop mobile ──────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ══ SIDEBAR ══════════════════════════════════════ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 flex flex-col transition-all duration-200 ease-in-out lg:relative lg:flex-shrink-0 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarW}`}
        style={{ background: BG, borderRight: BDR }}
      >
        {/* ── Logo ────────────────────────────────────── */}
        <div
          className="flex items-center flex-shrink-0 overflow-hidden"
          style={{
            borderBottom: BDR,
            minHeight: 60,
            padding: (showText && companyLogo) ? 0 : (showText ? '12px 20px' : '12px 0'),
          }}
        >
          {!showText ? (
            <div className="w-full flex justify-center">
              {companyLogo ? (
                <img src={companyLogo} alt="Logo" style={{ width: 36, height: 36, objectFit: 'contain' }} />
              ) : (
                <div style={{ background: GRN, borderRadius: 6, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#FFF', fontSize: 13, fontWeight: 900 }}>G</span>
                </div>
              )}
            </div>
          ) : companyLogo ? (
            <img
              src={companyLogo}
              alt="Logo"
              style={{ width: '100%', height: 60, objectFit: 'cover' }}
            />
          ) : (
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 1 }}>GESTORA</p>
              <p style={{ color: '#FFF', fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1 }}>SMART</p>
              <div style={{ background: GRN, borderRadius: 3, padding: '1px 6px', display: 'inline-block', marginTop: 3 }}>
                <p style={{ color: '#FFF', fontSize: 7, fontWeight: 700, letterSpacing: '0.08em' }}>SISTEMA FINANCEIRO</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Navegação ───────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '12px 0' }}>
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section} style={{ marginBottom: 16 }}>
              {showText && (
                <p style={{ color: '#4B5563', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 16px', marginBottom: 4 }}>
                  {section}
                </p>
              )}
              {!showText && <div style={{ borderTop: BDR, margin: '0 8px 6px', opacity: 0.5 }} />}

              {items.map(({ to, label }) => {
                const Icon = NAV_ICONS[to] || FileText
                // end=true quando esta rota é prefixo de outra na mesma nav (ex: /organograma vs /organograma/gerenciar)
                const isParent = navItems.some(item => item.to !== to && item.to.startsWith(to + '/'))
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={isParent}
                    onClick={() => setMobileOpen(false)}
                    className="relative flex items-center group gs-nav-item"
                    style={({ isActive }) => ({
                      justifyContent:  showText ? 'flex-start' : 'center',
                      gap:             showText ? 10 : 0,
                      padding:         showText ? '8px 12px 8px 16px' : '10px 0',
                      margin:          showText ? '1px 6px' : '1px 0',
                      borderRadius:    8,
                      fontSize:        13,
                      fontWeight:      isActive ? 600 : 500,
                      color:           isActive ? GRN : '#9CA3AF',
                      background:      isActive ? 'rgba(60,181,74,0.12)' : 'transparent',
                      borderLeft:      isActive && showText ? `3px solid ${GRN}` : '3px solid transparent',
                      paddingLeft:     showText ? (isActive ? 13 : 16) : 0,
                      textDecoration:  'none',
                      transition:      'all 0.15s',
                      overflow:        'hidden',
                      whiteSpace:      'nowrap',
                    })}
                  >
                    <Icon size={16} style={{ flexShrink: 0 }} />
                    {showText && <span>{label}</span>}

                    {/* Tooltip colapsado */}
                    {!showText && (
                      <span
                        className="pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity z-50"
                        style={{
                          left: '100%', top: '50%', transform: 'translateY(-50%)',
                          marginLeft: 10,
                          background: '#1F1F1F', color: '#F9FAFB',
                          border: '1px solid #333',
                          padding: '4px 10px', borderRadius: 6,
                          fontSize: 12, fontWeight: 500,
                          whiteSpace: 'nowrap',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        }}
                      >
                        {label}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        {/* ── Trocar módulo ───────────────────────────── */}
        {availableModules.length > 1 && (
          <div style={{ padding: '0 8px 8px' }}>
            <button
              onClick={() => { clearModule(); navigate('/') }}
              title="Trocar módulo"
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: showText ? 'flex-start' : 'center',
                gap: showText ? 8 : 0,
                padding: showText ? '7px 10px' : '8px 0',
                borderRadius: 8, fontSize: 12, fontWeight: 500,
                color: '#6B7280', border: '1px dashed #2A2A2A',
                background: 'transparent', cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#1A1A1A'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <LayoutGrid size={14} style={{ flexShrink: 0 }} />
              {showText && <span>Trocar módulo</span>}
            </button>
          </div>
        )}

        {/* ── Perfil + Sair ───────────────────────────── */}
        <div style={{ borderTop: BDR, padding: showText ? '10px' : '10px 6px' }}>
          {!showText ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div title={user?.name} style={{ width: 32, height: 32, borderRadius: '50%', background: '#1F3A23', color: GRN, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                {initials}
              </div>
              <button
                onClick={handleLogout}
                title="Sair da conta"
                style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2A1A1A'; e.currentTarget.style.color = '#EF4444' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8, background: '#1A1A1A', marginBottom: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1F3A23', color: GRN, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#FFF', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
                  <p style={{ color: '#6B7280', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.role_label}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#9CA3AF', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2A1A1A'; e.currentTarget.style.color = '#EF4444' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF' }}
              >
                <LogOut size={13} />
                Sair da conta
              </button>
            </>
          )}
        </div>

        {/* ── Botão colapsar — canto inferior direito (desktop) ── */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="hidden lg:flex absolute items-center justify-center"
          style={{
            right: -12, bottom: 28, zIndex: 10,
            width: 24, height: 24, borderRadius: '50%',
            background: '#2A2A2A', border: '1px solid #3A3A3A',
            color: '#9CA3AF', cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = GRN; e.currentTarget.style.color = '#FFF' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#2A2A2A'; e.currentTarget.style.color = '#9CA3AF' }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* ══ CONTEÚDO PRINCIPAL ══════════════════════════ */}
      <div className="flex flex-col min-w-0 overflow-hidden" style={{ flex: 1 }}>

        {/* Topbar mobile */}
        <div
          className="lg:hidden flex items-center gap-3 flex-shrink-0"
          style={{ background: BG, height: 52, borderBottom: BDR, padding: '0 16px' }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            style={{ padding: 6, borderRadius: 8, color: '#9CA3AF', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.background = '#1F1F1F'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Menu size={20} />
          </button>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 8, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>GESTORA SMART</p>
            <p style={{ color: '#FFF', fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{pageTitle}</p>
          </div>
        </div>

        {/* Conteúdo */}
        <main className="flex-1 overflow-y-auto" style={{ background: '#F5F5F5', padding: 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
