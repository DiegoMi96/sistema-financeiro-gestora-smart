import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useModule } from '../../contexts/ModuleContext'
import { Users, BarChart2, LogOut, TrendingUp } from 'lucide-react'

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

// Dados de demonstração — estrutura igual ao Excel
const DEMO_DATA = {
  '2026-05': [
    { id: 1,  categoria: '1 - Vendedor',      executivo: 'Décio Moraes',              simcard: 1597.25,  bonificacao: 0,       equipamento: 0,       smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 2,  categoria: '1 - Vendedor',      executivo: 'Ana Palhares',              simcard: 11913.79, bonificacao: 0,       equipamento: 0,       smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 3,  categoria: '1 - Vendedor',      executivo: 'Claudia Longano',           simcard: 2282.48,  bonificacao: 0,       equipamento: 739.47,  smartgps: 29.17,  desc_canc: 0,        desc_frete: -34.18 },
    { id: 4,  categoria: '1 - Vendedor',      executivo: 'Daiane Oliveira',           simcard: 691.37,   bonificacao: 0,       equipamento: 62.03,   smartgps: 4.50,   desc_canc: 0,        desc_frete: 0 },
    { id: 5,  categoria: '1 - Vendedor',      executivo: 'Gabriela Geraud',           simcard: 1002.65,  bonificacao: 0,       equipamento: 14.16,   smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 6,  categoria: '1 - Vendedor',      executivo: 'Henrique Alves',            simcard: 1400.00,  bonificacao: 200.00,  equipamento: 0,       smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 7,  categoria: '1 - Vendedor',      executivo: 'Julia Borsato',             simcard: 204.72,   bonificacao: 150.00,  equipamento: 0,       smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 8,  categoria: '1 - Vendedor',      executivo: 'Patrick Rodrigues',         simcard: 783.75,   bonificacao: 0,       equipamento: 1906.00, smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 9,  categoria: '1 - Vendedor',      executivo: 'Renato Araujo',             simcard: 884.61,   bonificacao: 0,       equipamento: 0,       smartgps: 6.98,   desc_canc: 0,        desc_frete: 0 },
    { id: 10, categoria: '1 - Vendedor',      executivo: 'Vitória Karoline',          simcard: 1050.13,  bonificacao: 0,       equipamento: 1.45,    smartgps: 19.57,  desc_canc: 0,        desc_frete: 0 },
    { id: 11, categoria: '2 - Dealer',        executivo: 'HTL Hilario',               simcard: 814.73,   bonificacao: 1000.00, equipamento: 0,       smartgps: 0,      desc_canc: -1164.00, desc_frete: 0 },
    { id: 12, categoria: '3 - Indicador',     executivo: 'Acacio Souza',              simcard: 120.00,   bonificacao: 0,       equipamento: 0,       smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 13, categoria: '3 - Indicador',     executivo: 'Augusto Rocha',             simcard: 204.00,   bonificacao: 0,       equipamento: 0,       smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 14, categoria: '3 - Indicador',     executivo: 'DM Tracker',                simcard: 274.00,   bonificacao: 0,       equipamento: 0,       smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 15, categoria: '3 - Indicador',     executivo: 'Joaquim Marinho',           simcard: 10.00,    bonificacao: 0,       equipamento: 0,       smartgps: 0,      desc_canc: 0,        desc_frete: 0 },
    { id: 16, categoria: '4 - Proj. Especial', executivo: 'Imperio Dos Rastreadores', simcard: 8319.72,  bonificacao: 0,       equipamento: 0,       smartgps: 0,      desc_canc: -972.00,  desc_frete: 0 },
    { id: 17, categoria: '4 - Proj. Especial', executivo: 'Ione Rastrek',             simcard: 2003.63,  bonificacao: 0,       equipamento: 0,       smartgps: 0,      desc_canc: -840.00,  desc_frete: 0 },
    { id: 18, categoria: '4 - Proj. Especial', executivo: 'Loja do Rastreador',       simcard: 9837.49,  bonificacao: 0,       equipamento: 0,       smartgps: 0,      desc_canc: -464.00,  desc_frete: 0 },
  ],
}

const MESES = [
  { value: '2026-05', label: 'Maio / 2026' },
  { value: '2026-04', label: 'Abril / 2026' },
  { value: '2026-03', label: 'Março / 2026' },
  { value: '2026-02', label: 'Fevereiro / 2026' },
  { value: '2026-01', label: 'Janeiro / 2026' },
]

const CAT_COLOR = {
  '1 - Vendedor':       'bg-green-50',
  '2 - Dealer':         'bg-blue-50',
  '3 - Indicador':      'bg-amber-50',
  '4 - Proj. Especial': 'bg-orange-50',
}

function fmtVal(v) {
  if (!v) return <span className="text-gray-300">—</span>
  const neg = v < 0
  return <span className={neg ? 'text-red-600' : ''}>{fmt(v)}</span>
}

export default function ComissionamentoPage() {
  const navigate = useNavigate()
  const { user, can, logout } = useAuth()
  const { clearModule, selectModule } = useModule()
  const [mes, setMes] = useState('2026-05')

  // Garante que o módulo ativo esteja definido ao entrar direto nesta página
  useEffect(() => { selectModule('comissionamento') }, [])

  const rows = DEMO_DATA[mes] || []
  const total = rows.reduce(
    (acc, r) => ({
      simcard:     acc.simcard     + (r.simcard || 0),
      bonificacao: acc.bonificacao + (r.bonificacao || 0),
      equipamento: acc.equipamento + (r.equipamento || 0),
      smartgps:    acc.smartgps    + (r.smartgps || 0),
      desc_canc:   acc.desc_canc   + (r.desc_canc || 0),
      desc_frete:  acc.desc_frete  + (r.desc_frete || 0),
    }),
    { simcard: 0, bonificacao: 0, equipamento: 0, smartgps: 0, desc_canc: 0, desc_frete: 0 }
  )
  const grandTotal = r => (r.simcard||0) + (r.bonificacao||0) + (r.equipamento||0) + (r.smartgps||0) + (r.desc_canc||0) + (r.desc_frete||0)
  const grandTotalAll = grandTotal(total)

  const isAdmin = user?.role === 'admin' || user?.role === 'gestor'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F5F5F5' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#16a34a' }}>
            <TrendingUp size={16} className="text-white" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Gestora Smart</p>
            <p className="text-sm font-semibold text-gray-800 leading-none">Comissionamento</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
            {MESES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <button
            onClick={() => { clearModule(); navigate('/') }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <LogOut size={14} />
            Módulos
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr style={{ background: '#2d5a27', color: '#fff' }}>
                  {['ID', 'Categoria', 'Executivo', 'Simcard', 'Bonificação', 'Equipamento', 'Smart GPS', 'Desc. Canc.', 'Desc. Frete', 'TOTAL'].map(h => (
                    <th key={h} className="px-4 py-3 text-center text-xs font-semibold tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={`border-b border-gray-100 hover:brightness-95 transition-all ${CAT_COLOR[r.categoria] || ''}`}>
                    <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-500 font-semibold">{r.id}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{r.categoria}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-800 font-medium whitespace-nowrap">{r.executivo}</td>
                    <td className="px-4 py-2.5 text-center text-xs">{fmtVal(r.simcard)}</td>
                    <td className="px-4 py-2.5 text-center text-xs">{fmtVal(r.bonificacao)}</td>
                    <td className="px-4 py-2.5 text-center text-xs">{fmtVal(r.equipamento)}</td>
                    <td className="px-4 py-2.5 text-center text-xs">{fmtVal(r.smartgps)}</td>
                    <td className="px-4 py-2.5 text-center text-xs">{fmtVal(r.desc_canc)}</td>
                    <td className="px-4 py-2.5 text-center text-xs">{fmtVal(r.desc_frete)}</td>
                    <td className="px-4 py-2.5 text-center text-xs font-semibold text-gray-800">{fmt(grandTotal(r))}</td>
                  </tr>
                ))}

                {/* Linha de total */}
                <tr style={{ background: '#2d5a27', color: '#fff' }}>
                  <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold">Total</td>
                  <td className="px-4 py-3 text-center text-xs font-bold">{fmt(total.simcard)}</td>
                  <td className="px-4 py-3 text-center text-xs font-bold">{fmt(total.bonificacao)}</td>
                  <td className="px-4 py-3 text-center text-xs font-bold">{fmt(total.equipamento)}</td>
                  <td className="px-4 py-3 text-center text-xs font-bold">{fmt(total.smartgps)}</td>
                  <td className="px-4 py-3 text-center text-xs font-bold">{fmt(total.desc_canc)}</td>
                  <td className="px-4 py-3 text-center text-xs font-bold">{fmt(total.desc_frete)}</td>
                  <td className="px-4 py-3 text-center text-xs font-bold">{fmt(grandTotalAll)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Botões admin */}
        {isAdmin && (
          <div className="flex gap-4 mt-6 justify-center">
            <button
              onClick={() => navigate('/comissionamento/parceiros')}
              className="flex items-center gap-2.5 px-6 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:shadow-md hover:border-green-300 transition-all"
            >
              <Users size={18} className="text-green-600" />
              Parceiros Regionais
            </button>
            <button
              onClick={() => navigate('/comissionamento/interno')}
              className="flex items-center gap-2.5 px-6 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:shadow-md hover:border-blue-300 transition-all"
            >
              <BarChart2 size={18} className="text-blue-600" />
              Comissionamento Interno
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
