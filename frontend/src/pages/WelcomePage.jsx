import { useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useModule, MODULES } from '../contexts/ModuleContext'
import { FileText, AlertCircle, TrendingUp, Truck, BarChart2, ChevronRight, Building2, Globe2, Shield, Lock } from 'lucide-react'
import api from '../services/api'

const ICONS = { FileText, AlertCircle, TrendingUp, Truck, BarChart2, Globe2, Shield }

const MODULE_HOME = {
  faturamento:     '/dashboard',
  contestacao:     '/contestacao',
  comissionamento: '/comissionamento',
  logistica:       '/logistica',
  controladoria:   '/dashboard',
  organograma:     '/organograma',
  acessos:         '/acessos',
  smt:             null,
}

const COLOR_MAP = {
  blue: {
    card: 'border-green-200 hover:border-green-400 hover:shadow-green-100/60',
    icon: 'bg-green-50 text-green-600',
    dot:  'bg-green-500',
    cta:  'text-green-500 group-hover:text-green-700',
  },
  orange: {
    card: 'border-orange-200 hover:border-orange-400 hover:shadow-orange-100/60',
    icon: 'bg-orange-50 text-orange-600',
    dot:  'bg-orange-500',
    cta:  'text-orange-500 group-hover:text-orange-700',
  },
  green: {
    card: 'border-green-200 hover:border-green-400 hover:shadow-green-100/60',
    icon: 'bg-green-50 text-green-600',
    dot:  'bg-green-500',
    cta:  'text-green-500 group-hover:text-green-700',
  },
  indigo: {
    card: 'border-indigo-200 hover:border-indigo-400 hover:shadow-indigo-100/60',
    icon: 'bg-indigo-50 text-indigo-600',
    dot:  'bg-indigo-500',
    cta:  'text-indigo-500 group-hover:text-indigo-700',
  },
  teal: {
    card: 'border-teal-200 hover:border-teal-400 hover:shadow-teal-100/60',
    icon: 'bg-teal-50 text-teal-600',
    dot:  'bg-teal-500',
    cta:  'text-teal-500 group-hover:text-teal-700',
  },
  violet: {
    card: 'border-violet-200 hover:border-violet-400 hover:shadow-violet-100/60',
    icon: 'bg-violet-50 text-violet-600',
    dot:  'bg-violet-500',
    cta:  'text-violet-500 group-hover:text-violet-700',
  },
  slate: {
    card: 'border-slate-200 hover:border-slate-400 hover:shadow-slate-100/60',
    icon: 'bg-slate-100 text-slate-600',
    dot:  'bg-slate-500',
    cta:  'text-slate-500 group-hover:text-slate-700',
  },
}

export default function WelcomePage() {
  const { user, can }                      = useAuth()
  const { availableModules, selectModule } = useModule()
  const navigate                           = useNavigate()

  // Pré-busca URL do dashboard SMT externo
  const { data: smtData } = useQuery({
    queryKey: ['smt-url'],
    queryFn: () => api.get('/auth/smt-url').then(r => r.data),
    enabled: availableModules.some(m => m.id === 'smt'),
    staleTime: 1000 * 60 * 5,
    retry: false,
  })

  const { data: appCfg } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data),
    staleTime: 1000 * 60 * 10,
    retry: false,
  })
  const companyLogo = appCfg?.empresa_logo || null

  useEffect(() => {
    if (availableModules.length === 1) {
      const route = MODULE_HOME[availableModules[0].id]
      if (!route) return
      if (route.startsWith('http')) return
      selectModule(availableModules[0].id)
      navigate(route, { replace: true })
    }
  }, [availableModules])

  if (availableModules.length === 1) return null

  const handleSelect = (module) => {
    if (module.id === 'controladoria') {
      navigate('/controladoria/dash')
      return
    }
    if (module.id === 'acessos') {
      navigate('/acessos')
      return
    }
    if (module.id === 'smt') {
      const url = smtData?.url || 'https://smt.gestorasmart.com.br'
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    const route = MODULE_HOME[module.id]
    if (!route) return
    selectModule(module.id)
    navigate(route)
  }

  const firstName = user?.name?.split(' ')[0] || 'usuário'
  const allModules = MODULES
  const gridClass  = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl'

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-6 p-4"
      style={{ background: 'linear-gradient(135deg, #060E07 0%, #0D1F10 50%, #060E07 100%)' }}>

      {/* Logo + Saudação */}
      <div className="flex flex-col items-center mb-4" style={{ marginTop: companyLogo ? 0 : 80 }}>
        {companyLogo ? (
          <img src={companyLogo} alt="Logo" style={{ height: 230, maxWidth: 780, objectFit: 'contain' }} />
        ) : (
          <div className="text-center">
            <p style={{ color: '#9CA3AF', fontSize: '10px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' }}>GESTORA</p>
            <p style={{ color: '#FFFFFF', fontSize: '36px', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>SMART</p>
            <div style={{ background: '#3CB54A', borderRadius: '3px', padding: '2px 8px', marginTop: '4px', display: 'inline-block' }}>
              <p style={{ color: '#FFFFFF', fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em' }}>SIMCARD | HARDWARE | SOFTWARE</p>
            </div>
          </div>
        )}
        <div className="text-center" style={{ marginTop: companyLogo ? -50 : 16 }}>
          <h1 className="text-xl font-bold text-white mb-0.5">
            Olá, {firstName}!
          </h1>
          <p className="text-slate-400 text-xs">
            Seja bem-vindo. Qual área deseja acessar agora?
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className={`grid gap-3 w-full ${gridClass}`}>
        {allModules.map((module) => {
          const Icon   = ICONS[module.icon] || FileText
          const colors = COLOR_MAP[module.color] || COLOR_MAP.blue
          const coming = module.status === 'coming'
          const locked = !coming && !!module.permission && !can(module.permission)
          const disabled = coming || locked

          return (
            <button
              key={module.id}
              onClick={() => !disabled && handleSelect(module)}
              disabled={disabled}
              className={`
                group bg-white rounded-xl border-2 p-4 text-left flex flex-col justify-between
                transition-all duration-200
                ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-xl hover:-translate-y-0.5'}
                ${colors.card}
              `}
              style={{ minHeight: 195, pointerEvents: disabled ? 'none' : undefined }}
            >
              {/* Ícone */}
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${locked ? 'bg-gray-100 text-gray-400' : colors.icon}`}>
                {locked ? <Lock size={18} /> : <Icon size={18} />}
              </div>

              {/* Conteúdo */}
              <div className="flex-1">
                <h2 className="text-sm font-bold text-gray-900 mb-1">
                  {module.label}
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {module.description}
                </p>
              </div>

              {/* CTA */}
              <div className={`flex items-center gap-1 text-xs font-semibold transition-colors mt-3 ${locked ? 'text-gray-400' : colors.cta}`}>
                {coming ? 'Em breve' : locked ? 'Sem acesso' : 'Acessar'}
                {!disabled && <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />}
              </div>
            </button>
          )
        })}
      </div>

    </div>
  )
}
