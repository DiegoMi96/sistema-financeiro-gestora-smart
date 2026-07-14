import { useState, useRef } from 'react'
import { Upload, Download, Target, Database } from 'lucide-react'
import toast from 'react-hot-toast'

const fmt  = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtK = v => { const n = Number(v||0); return n >= 1000 ? `R$ ${(n/1000).toFixed(1)}K` : fmt(n) }

export default function PlanejamentoPage() {
  const [metas, setMetas] = useState({ W1: 32000, W2: 160000, W3: 28000, W4: 21000 })
  const [saved, setSaved] = useState(false)
  const [perfilData, setPerfilData] = useState([])
  const [perfilHeaders, setPerfilHeaders] = useState([])
  const [search, setSearch] = useState('')
  const fileRef = useRef()

  const totalMeta = Object.values(metas).reduce((a, b) => a + Number(b), 0)

  const handleSave = () => {
    setSaved(true)
    toast.success('Metas salvas!')
    setTimeout(() => setSaved(false), 2000)
  }

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) { toast.error('Apenas arquivos .csv são suportados'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').filter(l => l.trim())
      if (lines.length < 2) { toast.error('Arquivo vazio ou sem dados'); return }
      const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/"/g, ''))
      const rows = lines.slice(1).map(line => {
        const vals = line.split(/[,;]/).map(v => v.trim().replace(/"/g, ''))
        const obj = {}
        headers.forEach((h, i) => { obj[h] = vals[i] || '—' })
        return obj
      })
      setPerfilHeaders(headers)
      setPerfilData(rows)
      toast.success(`${rows.length} clientes carregados`)
    }
    reader.readAsText(file, 'UTF-8')
  }

  const downloadTemplate = () => {
    const header = 'Cliente,Dias Médios,Tendência,Previsão Próx. Pagamento,Instrumento,Confiabilidade,Semana Prevista\n'
    const rows = [
      'ORENDAPAY SOLUCOES,+6,Estável,16/07/2026,Pix,Alta,W2',
      'MODO CORPORATE GROUP,0,Estável,10/07/2026,Boleto,Alta,W2',
      'CLIENTE EXEMPLO,+2,Crescente,12/07/2026,Boleto,Média,W2',
    ].join('\n')
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = 'template_perfil_pagamento.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = search
    ? perfilData.filter(r => Object.values(r).some(v => v.toLowerCase?.().includes(search.toLowerCase())))
    : perfilData

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="gs-page-title">Planejamento</h1>
        <p className="gs-page-sub">Metas semanais, perfil comportamental e fontes de dados</p>
      </div>

      {/* Banner */}
      <div className="flex gap-3 items-start px-4 py-3 rounded-xl text-sm" style={{ background: '#EEF2FF', border: '1px solid #BFDBFE' }}>
        <Target size={15} style={{ color: '#2563EB', flexShrink: 0, marginTop: 2 }} />
        <span style={{ color: '#1E40AF' }}>
          O planejamento usa o <strong>comportamento histórico de pagamento do cliente</strong> como previsão — não a data de vencimento do boleto.
          Clientes com padrão de pagamento conhecido têm previsão mais confiável que o vencimento formal.
        </span>
      </div>

      {/* Metas */}
      <div className="gs-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target size={15} style={{ color: '#2563EB' }} />
          <h2 className="gs-section-title">Configurar metas · próxima competência</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {['W1','W2','W3','W4'].map((w, i) => (
            <div key={w}>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {w} · {['29 Jun – 5 Jul','6–12 Jul','13–19 Jul','20–26 Jul'][i]}
              </label>
              <input
                type="number"
                value={metas[w]}
                onChange={e => setMetas(p => ({ ...p, [w]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <div className="p-3 rounded-lg text-sm mb-4" style={{ background: '#F8FAFC' }}>
          Total configurado: <strong>{fmt(totalMeta)}</strong>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="gs-btn gs-btn-primary gs-btn-sm flex items-center gap-1.5">
            {saved ? '✓ Salvo' : 'Salvar metas'}
          </button>
          <button
            onClick={() => setMetas({ W1: 32000, W2: 160000, W3: 28000, W4: 21000 })}
            className="gs-btn gs-btn-outline gs-btn-sm"
          >
            Copiar de JUN/26
          </button>
        </div>
      </div>

      {/* Perfil de pagamento */}
      <div className="gs-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Upload size={15} style={{ color: '#2563EB' }} />
          <h2 className="gs-section-title">Perfil de pagamento por cliente · base comportamental</h2>
          <p className="text-xs text-gray-400 ml-auto">Dias médios entre emissão e pagamento efetivo</p>
        </div>

        {perfilData.length === 0 ? (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors mb-4"
            >
              <Upload size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-500">Clique para importar planilha</p>
              <p className="text-xs text-gray-400 mt-1">Formatos aceitos: .csv — Colunas: Cliente, Dias Médios, Instrumento, Confiabilidade, Semana Prevista</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Não tem o arquivo? Baixe o template e preencha.</span>
              <button onClick={downloadTemplate} className="gs-btn gs-btn-outline gs-btn-sm flex items-center gap-1.5">
                <Download size={13} /> Baixar template
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500">{filtered.length} de {perfilData.length} clientes</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none w-44"
                />
                <button onClick={() => { setPerfilData([]); setPerfilHeaders([]); setSearch('') }}
                  className="gs-btn gs-btn-outline gs-btn-sm text-xs">Remover</button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>{perfilHeaders.map(h => <th key={h} className="gs-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={i} className="gs-tr border-t border-gray-100">
                      {perfilHeaders.map(h => <td key={h} className="gs-td text-xs">{row[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Fontes de dados */}
      <div className="gs-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database size={15} style={{ color: '#2563EB' }} />
          <h2 className="gs-section-title">Fontes de dados · status de sincronização</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="gs-th">Fonte</th>
                <th className="gs-th-right">Emitido</th>
                <th className="gs-th-right">Recebido</th>
                <th className="gs-th-right">Pendente</th>
                <th className="gs-th">Taxa</th>
                <th className="gs-th">Última atualização</th>
                <th className="gs-th">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="gs-tr border-t border-gray-100">
                <td className="gs-td font-medium">API Asaas · automático</td>
                <td className="gs-td text-right">R$ 145.000,00</td>
                <td className="gs-td text-right text-green-700">R$ 101.200,00</td>
                <td className="gs-td text-right text-red-600">R$ 43.800,00</td>
                <td className="gs-td"><span className="gs-badge gs-badge-amber">69,8%</span></td>
                <td className="gs-td text-gray-400 text-xs">13/06 08:47</td>
                <td className="gs-td"><span className="gs-badge gs-badge-green">Sincronizado</span></td>
              </tr>
              <tr className="gs-tr border-t border-gray-100">
                <td className="gs-td font-medium">Excel Banco 2 · manual</td>
                <td className="gs-td text-right">R$ 96.238,00</td>
                <td className="gs-td text-right text-green-700">R$ 66.181,00</td>
                <td className="gs-td text-right text-red-600">R$ 30.057,00</td>
                <td className="gs-td"><span className="gs-badge gs-badge-amber">68,8%</span></td>
                <td className="gs-td text-gray-400 text-xs">12/06 18:30</td>
                <td className="gs-td"><span className="gs-badge gs-badge-gray">Aguardando import</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
