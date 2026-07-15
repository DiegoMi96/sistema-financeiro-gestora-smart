import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { Save, RefreshCw, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'

// ─────────────────────────────────────────────
// Definição completa dos indicadores por aba
// ─────────────────────────────────────────────
const TABS = [
  {
    id: 'vendas', label: 'Vendas & Performance',
    sections: [
      {
        title: 'BASE DE CLIENTES', color: '#065f46',
        fields: [
          { chave: 'Base_Ativa',  label: 'Base Ativa (Simcards faturantes)',    unit: 'Qtd' },
          { chave: 'Base_Pre',    label: 'Base PréAtiva (aguardando ativação)', unit: 'Qtd' },
          { chave: 'Base_Susp',   label: 'Base Suspensa',                       unit: 'Qtd' },
          { chave: 'Base_SW',     label: 'Base Software (licenças ativas)',      unit: 'Qtd' },
        ],
      },
      {
        title: 'COMERCIAL / VENDAS', color: '#7c3aed',
        fields: [
          { chave: 'Vendas_SIM',  label: 'Vendas de SIMs no Mês',               unit: 'Qtd' },
          { chave: 'Vendas_EQ',   label: 'Vendas de Equipamentos',               unit: 'Qtd' },
          { chave: 'Novos_CLI',   label: 'Novos Clientes no Mês',                unit: 'Qtd' },
          { chave: 'Cancelam',    label: 'Cancelamentos no Mês',                 unit: 'Qtd' },
          { chave: 'Desistencia', label: 'Desistências (PréAtivação)',            unit: 'Qtd' },
          { chave: 'Atv_Qtd',    label: 'Ativações Previstas (meses futuros)',   unit: 'Qtd' },
        ],
      },
    ],
  },
  {
    id: 'rh', label: 'RH',
    sections: [
      {
        title: 'RH — GERAL', color: '#b45309',
        fields: [
          { chave: 'RH_CLT',      label: 'Colaboradores CLT',                    unit: 'Qtd' },
          { chave: 'RH_PJ',       label: 'Colaboradores PJ',                     unit: 'Qtd' },
          { chave: 'RH_Folha',    label: 'Custo folha de pagamento',              unit: 'R$'  },
          { chave: 'RH_Salario',  label: 'Folha de Pagamento (bruto)',            unit: 'R$'  },
          { chave: 'RH_Faltas',   label: 'Faltas não justificadas',               unit: 'Qtd' },
          { chave: 'RH_Rescisao', label: 'Custo de rescisões',                    unit: 'R$'  },
          { chave: 'RH_Deslig',   label: 'Colaboradores desligados',              unit: 'Qtd' },
          { chave: 'RH_Afasta',   label: 'Afastamentos (INSS / licença)',         unit: 'Qtd' },
        ],
      },
      {
        title: 'RH — DISTRIBUIÇÃO POR DEPARTAMENTO', color: '#92400e',
        fields: [
          { chave: 'RH_D_Comerc', label: 'Comercial',             unit: 'Qtd' },
          { chave: 'RH_D_Oper',   label: 'Suporte Técnico',       unit: 'Qtd' },
          { chave: 'RH_D_TI',     label: 'Operacional / TI',      unit: 'Qtd' },
          { chave: 'RH_D_Log',    label: 'Logística',             unit: 'Qtd' },
          { chave: 'RH_D_Dev',    label: 'Desenvolvedor',         unit: 'Qtd' },
          { chave: 'RH_D_Admin',  label: 'Administrativo',        unit: 'Qtd' },
          { chave: 'RH_D_Mkt',    label: 'Marketing',             unit: 'Qtd' },
          { chave: 'RH_D_Fin',    label: 'Financeiro',            unit: 'Qtd' },
          { chave: 'RH_D_Fac',    label: 'Facilitis',             unit: 'Qtd' },
          { chave: 'RH_D_Sup',    label: 'Supervisores',          unit: 'Qtd' },
          { chave: 'RH_D_Dir',    label: 'Diretoria',             unit: 'Qtd' },
          { chave: 'RH_D_Cons',   label: 'Conselho de Administração', unit: 'Qtd' },
        ],
      },
    ],
  },
  {
    id: 'logistica', label: 'Logística',
    sections: [
      {
        title: 'LOGÍSTICA', color: '#1d4ed8',
        fields: [
          { chave: 'Vol_Envio',   label: 'Volume de Envios no Mês',  unit: 'Qtd' },
          { chave: 'Custo_Envio', label: 'Custo Total de Envios',     unit: 'R$'  },
        ],
      },
    ],
  },
  {
    id: 'operacao', label: 'Operação',
    sections: [
      {
        title: 'SUPORTE TÉCNICO', color: '#0f766e',
        fields: [
          { chave: 'Tickets',    label: 'Tickets de Atendimento',   unit: 'Qtd' },
          { chave: 'Satisfacao', label: 'Satisfação do Cliente',    unit: '%'   },
        ],
      },
      {
        title: 'MENSALIDADE POR OPERADORA (R$/chip)', color: '#0369a1',
        fields: [
          { chave: 'OP_ALGAR_MENS',    label: 'Algar Telecom',            unit: 'R$' },
          { chave: 'OP_ALGAR_M_MENS',  label: 'Algar Telecom (Mult)',     unit: 'R$' },
          { chave: 'OP_ARQIA_MENS',    label: 'Arqia',                    unit: 'R$' },
          { chave: 'OP_ARQIA_2_MENS',  label: 'Arqia (2 OP)',             unit: 'R$' },
          { chave: 'OP_ARQIA_I_MENS',  label: 'Arqia (Internacional)',    unit: 'R$' },
          { chave: 'OP_CLARO_MENS',    label: 'Claro',                    unit: 'R$' },
          { chave: 'OP_CLARO_BL_MENS', label: 'Claro (BL)',               unit: 'R$' },
          { chave: 'OP_CLARO_C_MENS',  label: 'Claro (CAMT1)',            unit: 'R$' },
          { chave: 'OP_SIERRA_MENS',   label: 'Sierra',                   unit: 'R$' },
          { chave: 'OP_TIM_MENS',      label: 'TIM',                      unit: 'R$' },
          { chave: 'OP_VIVO_MENS',     label: 'Vivo',                     unit: 'R$' },
          { chave: 'OP_VIVO_BL_MENS',  label: 'Vivo (BL)',                unit: 'R$' },
          { chave: 'OP_VIVO_C_MENS',   label: 'Vivo (CAMT1)',             unit: 'R$' },
        ],
      },
      {
        title: 'CUSTO TOTAL POR OPERADORA (pago no mês)', color: '#155e75',
        fields: [
          { chave: 'OP_ALGAR_CUSTO',    label: 'Algar Telecom',           unit: 'R$' },
          { chave: 'OP_ALGAR_M_CUSTO',  label: 'Algar Telecom (Mult)',    unit: 'R$' },
          { chave: 'OP_ARQIA_CUSTO',    label: 'Arqia',                   unit: 'R$' },
          { chave: 'OP_ARQIA_2_CUSTO',  label: 'Arqia (2 OP)',            unit: 'R$' },
          { chave: 'OP_ARQIA_I_CUSTO',  label: 'Arqia (Internacional)',   unit: 'R$' },
          { chave: 'OP_CLARO_CUSTO',    label: 'Claro',                   unit: 'R$' },
          { chave: 'OP_CLARO_BL_CUSTO', label: 'Claro (BL)',              unit: 'R$' },
          { chave: 'OP_CLARO_C_CUSTO',  label: 'Claro (CAMT1)',           unit: 'R$' },
          { chave: 'OP_SIERRA_CUSTO',   label: 'Sierra',                  unit: 'R$' },
          { chave: 'OP_TIM_CUSTO',      label: 'TIM',                     unit: 'R$' },
          { chave: 'OP_VIVO_CUSTO',     label: 'Vivo',                    unit: 'R$' },
          { chave: 'OP_VIVO_BL_CUSTO',  label: 'Vivo (BL)',               unit: 'R$' },
          { chave: 'OP_VIVO_C_CUSTO',   label: 'Vivo (CAMT1)',            unit: 'R$' },
        ],
      },
      {
        title: 'POOL DE DADOS — uso mensal (MB)', color: '#1e3a5f',
        fields: [
          { chave: 'POOL_VIVO_PCT',    label: 'Vivo',              unit: 'MB' },
          { chave: 'POOL_TIM_PCT',     label: 'TIM',               unit: 'MB' },
          { chave: 'POOL_ALGAR_M_PCT', label: 'Algar (Múltiplo)', unit: 'MB' },
          { chave: 'POOL_ALGAR_O_PCT', label: 'Algar (Outros)',    unit: 'MB' },
          { chave: 'POOL_ARQIA_PCT',   label: 'Arqia',             unit: 'MB' },
        ],
      },
      {
        title: 'QUANTIDADE DE CHIPS POR OPERADORA', color: '#164e63',
        fields: [
          { chave: 'OP_ALGAR_QTD',    label: 'ALGAR',              unit: 'Qtd' },
          { chave: 'OP_ALGAR_M_QTD',  label: 'ALGAR MULTI',        unit: 'Qtd' },
          { chave: 'OP_ARQIA_QTD',    label: 'ARQIA',              unit: 'Qtd' },
          { chave: 'OP_ARQIA_2_QTD',  label: 'ARQIA 2OP',          unit: 'Qtd' },
          { chave: 'OP_ARQIA_I_QTD',  label: 'ARQIA INTERNACIONAL', unit: 'Qtd' },
          { chave: 'OP_CLARO_QTD',    label: 'CLARO',              unit: 'Qtd' },
          { chave: 'OP_CLARO_BL_QTD', label: 'CLARO BL',           unit: 'Qtd' },
          { chave: 'OP_CLARO_C_QTD',  label: 'CLARO CATM1',        unit: 'Qtd' },
          { chave: 'OP_SIERRA_QTD',   label: 'SIERRA',             unit: 'Qtd' },
          { chave: 'OP_TIM_QTD',      label: 'TIM',                unit: 'Qtd' },
          { chave: 'OP_VIVO_QTD',     label: 'VIVO',               unit: 'Qtd' },
          { chave: 'OP_VIVO_BL_QTD',  label: 'VIVO BL',            unit: 'Qtd' },
          { chave: 'OP_VIVO_C_QTD',   label: 'VIVO CATM1',         unit: 'Qtd' },
        ],
      },
    ],
  },
]

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtDisplay(value, unit) {
  if (value === null || value === undefined || value === '') return ''
  const n = parseFloat(value)
  if (isNaN(n)) return ''
  if (unit === 'R$') return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (unit === 'MB') return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (unit === '%')  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
  return n.toLocaleString('pt-BR')
}

function parseInput(raw) {
  if (!raw || raw.trim() === '') return null
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// ─────────────────────────────────────────────
// Componente de campo individual
// ─────────────────────────────────────────────
function IndicField({ chave, label, unit, value, onChange, dirty }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const inputRef = useRef(null)

  const handleFocus = () => {
    setEditing(true)
    setRaw(value !== null && value !== undefined ? String(value).replace('.', ',') : '')
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleBlur = () => {
    setEditing(false)
    onChange(chave, parseInput(raw))
  }

  const unitColor = unit === 'R$' ? '#16a34a' : unit === 'MB' ? '#2563eb' : '#6b7280'

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '7px 16px',
      borderBottom: '1px solid #f3f4f6',
      background: dirty ? '#f0fdf4' : 'transparent',
      transition: 'background 0.15s',
    }}>
      <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: unitColor, minWidth: 24, textAlign: 'right' }}>{unit}</span>
        {editing ? (
          <input
            ref={inputRef}
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={e => { if (e.key === 'Enter') inputRef.current?.blur() }}
            style={{
              width: 120, padding: '3px 8px', border: '1.5px solid #3CB54A',
              borderRadius: 6, fontSize: 13, textAlign: 'right',
              outline: 'none', background: '#fff',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
        ) : (
          <div
            onClick={handleFocus}
            style={{
              width: 120, padding: '3px 8px',
              border: '1px solid #e5e7eb', borderRadius: 6,
              fontSize: 13, textAlign: 'right', cursor: 'text',
              background: '#fff', color: value !== null ? '#111827' : '#d1d5db',
              fontVariantNumeric: 'tabular-nums',
              minHeight: 26,
            }}
          >
            {value !== null && value !== undefined ? fmtDisplay(value, unit) : '—'}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Seção colapsável
// ─────────────────────────────────────────────
function Section({ section, values, dirty, onChange }) {
  const [open, setOpen] = useState(true)
  const hasAny = section.fields.some(f => values[f.chave] !== null && values[f.chave] !== undefined)

  return (
    <div className="gs-card" style={{ marginBottom: 12, overflow: 'hidden', borderRadius: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px',
          background: section.color, color: '#fff',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {section.title}
        </span>
        {!open && hasAny && (
          <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>
            {section.fields.filter(f => values[f.chave] !== null && values[f.chave] !== undefined).length} preenchidos
          </span>
        )}
      </button>
      {open && section.fields.map(f => (
        <IndicField
          key={f.chave}
          {...f}
          value={values[f.chave] ?? null}
          dirty={dirty.has(f.chave)}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────
export default function IndicadoresPage() {
  const qc = useQueryClient()
  const now = new Date()
  const [year,  setYear]  = useState(2026)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [activeTab, setActiveTab] = useState('vendas')
  const [values, setValues] = useState({})   // {chave: number|null}
  const [dirty,  setDirty]  = useState(new Set())

  // ── Busca dados do mês
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['indicators', year, month],
    queryFn: () => api.get(`/sheets/indicators?year=${year}&month=${month}`).then(r => r.data),
    staleTime: 2 * 60 * 1000,
  })

  // Configuração do Google Sheets
  const { data: cfg } = useQuery({
    queryKey: ['sheets-config'],
    queryFn: () => api.get('/sheets/config').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

  // Preenche os values quando os dados chegam
  useEffect(() => {
    if (data?.data) {
      setValues(prev => ({ ...prev, ...data.data }))
      setDirty(new Set())
    }
  }, [data])

  // Reseta dirty ao trocar mês
  useEffect(() => { setDirty(new Set()) }, [year, month])

  const handleChange = (chave, newVal) => {
    setValues(prev => ({ ...prev, [chave]: newVal }))
    setDirty(prev => { const n = new Set(prev); n.add(chave); return n })
  }

  // ── Salvar
  const saveMut = useMutation({
    mutationFn: () => {
      const updates = {}
      dirty.forEach(chave => { updates[chave] = values[chave] ?? null })
      return api.put('/sheets/indicators', { year, month, updates }).then(r => r.data)
    },
    onSuccess: () => {
      toast.success('Salvo! Sincronizando com a planilha…')
      setDirty(new Set())
      qc.invalidateQueries({ queryKey: ['indicators', year, month] })
    },
    onError: e => toast.error(e.response?.data?.detail || 'Erro ao salvar'),
  })

  // ── Importar da planilha
  const importMut = useMutation({
    mutationFn: () =>
      api.post(`/sheets/import?year=${year}&month=${month}`).then(r => r.data),
    onSuccess: res => {
      toast.success(`${res.imported} indicadores importados da planilha`)
      qc.invalidateQueries({ queryKey: ['indicators', year, month] })
    },
    onError: e => toast.error(e.response?.data?.detail || 'Erro ao importar'),
  })

  const activeTabDef = TABS.find(t => t.id === activeTab)
  const sheetConfigured = cfg?.spreadsheet_id && cfg?.has_service_account

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="gs-page-title">Indicadores Mensais</h1>
          <p className="gs-page-sub">Preencha os dados mensais — sincronizam automaticamente com a planilha</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {!sheetConfigured && (
            <span style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={12} /> Planilha não configurada
            </span>
          )}
          <button
            onClick={() => importMut.mutate()}
            disabled={importMut.isPending || !sheetConfigured}
            className="gs-btn gs-btn-outline gs-btn-sm"
            title={!sheetConfigured ? 'Configure a planilha em Configurações › Planilha' : ''}
          >
            <RefreshCw size={13} className={importMut.isPending ? 'animate-spin' : ''} />
            Importar da planilha
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || dirty.size === 0}
            className="gs-btn gs-btn-primary gs-btn-sm"
          >
            <Save size={13} />
            {saveMut.isPending ? 'Salvando…' : `Salvar${dirty.size > 0 ? ` (${dirty.size})` : ''}`}
          </button>
        </div>
      </div>

      {/* Seletor de mês/ano */}
      <div className="gs-card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Período</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {MONTHS.map((m, i) => (
            <button
              key={i}
              onClick={() => setMonth(i + 1)}
              style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: month === i + 1 ? '#3CB54A' : '#f3f4f6',
                color: month === i + 1 ? '#fff' : '#6b7280',
                transition: 'all 0.1s',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="gs-select"
          style={{ padding: '4px 10px', fontSize: 12, width: 'auto' }}
        >
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {isFetching && <span style={{ fontSize: 11, color: '#9ca3af' }}>Carregando…</span>}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
        {TABS.map(t => {
          const tabDirty = t.sections.flatMap(s => s.fields).filter(f => dirty.has(f.chave)).length
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: 'transparent',
                color: activeTab === t.id ? '#3CB54A' : '#9ca3af',
                borderBottom: activeTab === t.id ? '2px solid #3CB54A' : '2px solid transparent',
                marginBottom: -1,
                position: 'relative',
                transition: 'all 0.1s',
              }}
            >
              {t.label}
              {tabDirty > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#f59e0b',
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Conteúdo da aba ativa */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Carregando…</div>
      ) : (
        <div>
          {activeTabDef?.sections.map(section => (
            <Section
              key={section.title}
              section={section}
              values={values}
              dirty={dirty}
              onChange={handleChange}
            />
          ))}
        </div>
      )}

    </div>
  )
}
