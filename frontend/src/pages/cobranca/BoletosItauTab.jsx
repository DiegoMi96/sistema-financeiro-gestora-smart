import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UploadCloud, FileText, Trash2, Search, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cobrancaApi } from '../../services/api'
import { brl, dataBR, horaBR, Modal } from './ui'

const ST = {
  ok:                  { rotulo: 'Pronto para vincular', cls: 'bg-green-50 text-green-700' },
  vinculado:           { rotulo: 'Vinculado', cls: 'bg-green-100 text-green-800' },
  substituido:         { rotulo: 'PDF substituído', cls: 'bg-green-100 text-green-800' },
  ja_tem:              { rotulo: 'Boleto já tem PDF', cls: 'bg-gray-100 text-gray-600' },
  duplicado:           { rotulo: 'Repetido neste lote', cls: 'bg-gray-100 text-gray-600' },
  divergente:          { rotulo: 'Valor/vencimento diferente', cls: 'bg-amber-50 text-amber-800' },
  ambiguo:             { rotulo: 'Mais de um boleto', cls: 'bg-amber-50 text-amber-800' },
  sem_correspondencia: { rotulo: 'Não achei o boleto', cls: 'bg-red-50 text-red-700' },
  ilegivel:            { rotulo: 'PDF sem texto', cls: 'bg-red-50 text-red-700' },
  outro_ciclo:         { rotulo: 'É de outro ciclo', cls: 'bg-amber-50 text-amber-800' },
  invalido:            { rotulo: 'Arquivo inválido', cls: 'bg-red-50 text-red-700' },
}

export default function BoletosItauTab({ onChange }) {
  const qc = useQueryClient()
  const inputRef = useRef(null)
  const [arquivos, setArquivos] = useState([])          // File[] escolhidos
  const [analise, setAnalise] = useState(null)          // resposta do modo "analisar"
  const [manual, setManual] = useState({})              // {nomeArquivo: nosso_numero}
  const [substituir, setSubstituir] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [busca, setBusca] = useState('')
  const [soSem, setSoSem] = useState(true)
  const [ciclo, setCiclo] = useState('')          // mês de emissão escolhido (obrigatório para subir PDFs)
  const [todos, setTodos] = useState(false)   // false = só o ciclo atual (vencimento de hoje em diante); true = inclui os já vencidos
  const [page, setPage] = useState(1)

  const { data: ciclos } = useQuery({ queryKey: ['cobranca-boletos-itau-ciclos'], queryFn: () => cobrancaApi.ciclosBoletosItau().then(r => r.data), staleTime: 0 })
  useEffect(() => { if (!ciclo && ciclos?.length) setCiclo(ciclos[0].ciclo) }, [ciclos])  // eslint-disable-line react-hooks/exhaustive-deps
  const rotuloCiclo = (ciclos || []).find(c => c.ciclo === ciclo)?.rotulo || ''
  const { data, refetch } = useQuery({
    queryKey: ['cobranca-boletos-itau', ciclo, busca, soSem, todos, page],
    enabled: !!ciclo,
    queryFn: () => cobrancaApi.boletosItau({ search: busca, so_sem_pdf: soSem, escopo: todos ? 'todos' : 'ciclo', ciclo, page, limit: 50 }).then(r => r.data),
    staleTime: 0, placeholderData: prev => prev,
  })
  const { data: semPdf } = useQuery({
    queryKey: ['cobranca-boletos-itau-sem', ciclo], enabled: !!ciclo, queryFn: () => cobrancaApi.boletosItau({ so_sem_pdf: true, escopo: 'todos', ciclo, limit: 200 }).then(r => r.data.itens), staleTime: 0,
  })

  const enviar = async (lista, modo) => {
    const fd = new FormData()
    lista.forEach(f => fd.append('files', f))
    fd.append('modo', modo)
    fd.append('ciclo', ciclo)
    fd.append('atribuicoes', JSON.stringify(manual))
    fd.append('substituir', substituir ? 'true' : 'false')
    return (await cobrancaApi.uploadBoletosItau(fd)).data
  }

  const escolher = async (e) => {
    const lista = [...(e.target.files || [])]
    e.target.value = ''
    if (!lista.length) return
    setOcupado(true); setManual({}); setAnalise(null)
    try { setArquivos(lista); setAnalise(await enviar(lista, 'analisar')) }
    catch (er) { toast.error(er.response?.data?.detail || 'Não foi possível ler os arquivos') }
    finally { setOcupado(false) }
  }
  const reanalisar = async () => {
    setOcupado(true)
    try { setAnalise(await enviar(arquivos, 'analisar')) } catch (er) { toast.error(er.response?.data?.detail || 'Erro') } finally { setOcupado(false) }
  }
  const vincular = async () => {
    setOcupado(true)
    try {
      const r = await enviar(arquivos, 'vincular')
      const n = (r.resumo.vinculado || 0) + (r.resumo.substituido || 0)
      toast.success(`${n} boleto(s) vinculado(s). Os e-mails desses boletos voltaram para aprovação.`)
      setAnalise(r); setArquivos([]); setManual({}); refetch(); qc.invalidateQueries({ queryKey: ['cobranca-boletos-itau-sem'] }); qc.invalidateQueries({ queryKey: ['cobranca-boletos-itau-ciclos'] }); onChange()
    } catch (er) { toast.error(er.response?.data?.detail || 'Erro ao vincular') } finally { setOcupado(false) }
  }
  const verPdf = async (nosso) => {
    try { const { data: blob } = await cobrancaApi.pdfBoletoItau(nosso); window.open(URL.createObjectURL(blob), '_blank') } catch { toast.error('Não foi possível abrir o PDF') }
  }
  const remover = async (nosso) => {
    if (!window.confirm('Remover o PDF deste boleto? Os e-mails ainda não enviados dele ficam aguardando boleto.')) return
    try { await cobrancaApi.removerBoletoItau(nosso); toast.success('PDF removido'); refetch(); qc.invalidateQueries({ queryKey: ['cobranca-boletos-itau-sem'] }); qc.invalidateQueries({ queryKey: ['cobranca-boletos-itau-ciclos'] }); onChange() } catch { toast.error('Erro ao remover') }
  }

  const itens = analise?.itens || []
  const prontos = itens.filter(i => (i.status === 'ok' && analise.modo === 'analisar') || manual[i.arquivo]).length
  const precisaManual = i => ['divergente', 'ambiguo', 'sem_correspondencia', 'ilegivel', 'outro_ciclo'].includes(i.status)

  return (
    <div className="p-5 space-y-5">
      <div className="max-w-3xl space-y-1">
        <p className="text-sm text-gray-700">O e-mail de cobrança do Itaú sempre leva o <b>boleto em PDF anexado</b>. Baixe os boletos no portal do Itaú e suba aqui (vários PDFs ou um ZIP): o sistema descobre de qual boleto é cada um pelo <b>CNPJ do pagador, vencimento e valor</b> e mostra o resultado para você conferir <b>antes</b> de gravar.</p>
        <p className="text-xs text-gray-500">Boleto sem PDF fica como “Aguardando boleto” na Fila e o e-mail não é enviado até o PDF estar aqui.</p>
      </div>

      <div className="max-w-xl">
        <label className="text-xs text-gray-600 block">A qual ciclo pertencem estes boletos? <span className="text-gray-400">(mês de emissão — obrigatório)</span>
          <select value={ciclo} onChange={e => { setCiclo(e.target.value); setManual({}); setAnalise(null); setArquivos([]); setPage(1) }} disabled={ocupado || !(ciclos || []).length}
            className="w-full border border-gray-200 rounded-lg p-2 text-sm mt-1 text-gray-800">
            {!(ciclos || []).length && <option value="">Nenhum boleto do Itaú em aberto — suba a planilha do Itaú primeiro</option>}
            {(ciclos || []).map(c => <option key={c.ciclo} value={c.ciclo}>Ciclo de {c.rotulo} — {c.abertos} em aberto · {c.sem_pdf} sem PDF</option>)}
          </select>
        </label>
        <p className="text-xs text-gray-400 mt-1">O sistema só liga o PDF a um boleto <b>deste ciclo</b>. Se um PDF for de outro ciclo, ele avisa e não grava.</p>
      </div>

      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
        <input ref={inputRef} type="file" accept=".pdf,.zip" multiple className="hidden" onChange={escolher} />
        <button onClick={() => inputRef.current?.click()} disabled={ocupado || !ciclo} className="gs-btn gs-btn-dark inline-flex items-center gap-2 disabled:opacity-50"><UploadCloud size={15} /> {ocupado ? 'Lendo…' : ciclo ? `Escolher PDFs ou ZIP do ciclo de ${rotuloCiclo}` : 'Escolha o ciclo acima'}</button>
        <p className="text-xs text-gray-400 mt-2">Até 2 MB por PDF · só PDFs de boleto · nada é gravado antes da sua confirmação</p>
      </div>

      {analise && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 flex items-center gap-3 flex-wrap text-sm">
            <span className="font-medium text-gray-800">{analise.modo === 'vincular' ? 'Resultado' : 'Conferência'}: {analise.total} arquivo(s)</span>
            {Object.entries(analise.resumo).map(([k, n]) => <span key={k} className={`text-xs px-2 py-0.5 rounded-full ${(ST[k] || {}).cls}`}>{n} {(ST[k] || {}).rotulo || k}</span>)}
            <label className="ml-auto text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={substituir} onChange={e => { setSubstituir(e.target.checked) }} /> substituir PDFs que já existem</label>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-white"><tr><th className="text-left px-3 py-2">Arquivo</th><th className="text-left px-3 py-2">Resultado</th><th className="text-left px-3 py-2">Boleto</th><th className="text-left px-3 py-2 w-64">Vínculo manual</th></tr></thead>
            <tbody>
              {itens.map(i => (
                <tr key={i.arquivo} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 text-gray-800 max-w-[220px] truncate" title={i.arquivo}><FileText size={13} className="inline mr-1 text-gray-400" />{i.arquivo}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${(ST[i.status] || {}).cls}`}>{(ST[i.status] || {}).rotulo || i.status}</span><p className="text-xs text-gray-400 mt-0.5 max-w-[220px]">{i.motivo}</p></td>
                  <td className="px-3 py-2 text-gray-600">{i.boleto ? <><p className="truncate max-w-[220px]">{i.boleto.pagador}</p><p className="text-xs text-gray-400">nº {i.boleto.nosso_numero} · venc. {dataBR(i.boleto.vencimento)} · {brl(i.boleto.valor)}</p></> : '—'}</td>
                  <td className="px-3 py-2">
                    {analise.modo === 'analisar' && precisaManual(i) && (
                      <select value={manual[i.arquivo] || ''} onChange={e => setManual(m => ({ ...m, [i.arquivo]: e.target.value || undefined }))} className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5">
                        <option value="">— escolher o boleto —</option>
                        {(semPdf || []).map(b => <option key={b.nosso_numero} value={b.nosso_numero}>{b.pagador} · {dataBR(b.data_vencimento)} · {brl(b.valor_titulo)} · nº {b.nosso_numero}</option>)}
                      </select>
                    )}
                    {manual[i.arquivo] && <p className="text-xs text-green-700 mt-1"><CheckCircle2 size={12} className="inline" /> vai para o nº {manual[i.arquivo]}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {analise.modo === 'analisar' && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3 justify-end">
              <button onClick={() => { setAnalise(null); setArquivos([]); setManual({}) }} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200">Descartar</button>
              <button onClick={reanalisar} disabled={ocupado} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200">Conferir de novo</button>
              <button onClick={vincular} disabled={ocupado || prontos === 0} className="text-sm px-4 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-40">Vincular {prontos} PDF(s)</button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-gray-800">Boletos do Itaú em aberto {data ? <span className="text-gray-400 font-normal">· ciclo de {rotuloCiclo} · {data.total} {todos ? 'na lista' : 'a vencer'} · {data.sem_pdf} sem PDF</span> : null}</p>
          <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer ml-auto"><input type="checkbox" checked={todos} onChange={e => { setTodos(e.target.checked); setPage(1) }} /> incluir já vencidos</label>
          <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={soSem} onChange={e => { setSoSem(e.target.checked); setPage(1) }} /> só os sem PDF</label>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" /><input value={busca} onChange={e => { setBusca(e.target.value); setPage(1) }} placeholder="Cliente, CNPJ ou nº" className="text-xs border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 w-52" /></div>
        </div>
        {data && !todos && data.vencidos_sem_pdf > 0 && (
          <p className="text-xs text-gray-500">{data.vencidos_sem_pdf} boleto(s) já vencido(s) deste ciclo sem PDF ficaram de fora da lista: o PDF só é usado no Lançamento e no Vencimento, e o aviso de atraso e o de bloqueio saem só com texto. Marque “incluir já vencidos” para vê-los.</p>
        )}
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-3 py-2">Cliente</th><th className="text-left px-3 py-2">Nº</th><th className="text-left px-3 py-2">Vencimento</th><th className="text-right px-3 py-2">Valor</th><th className="text-left px-3 py-2">PDF</th><th className="w-20" /></tr></thead>
            <tbody>
              {(data?.itens || []).length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400">{soSem ? 'Nenhum boleto aguardando PDF.' : 'Nenhum boleto.'}</td></tr>}
              {(data?.itens || []).map(b => (
                <tr key={b.nosso_numero} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-800 truncate max-w-[260px]">{b.pagador}</td>
                  <td className="px-3 py-2 text-gray-600">{b.nosso_numero}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{dataBR(b.data_vencimento)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{brl(b.valor_titulo)}</td>
                  <td className="px-3 py-2">{b.tem_pdf ? <span className="text-xs text-green-700">✓ {b.arquivo_nome || 'PDF'}{b.vinculo === 'manual' ? ' (manual)' : ''}<span className="text-gray-400"> · {horaBR(b.enviado_em)}</span></span> : <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">sem PDF</span>}</td>
                  <td className="px-3 py-2"><div className="flex gap-1.5 justify-end text-gray-400">{b.tem_pdf && <><button title="Ver PDF" onClick={() => verPdf(b.nosso_numero)} className="hover:text-gray-800"><FileText size={15} /></button><button title="Remover PDF" onClick={() => remover(b.nosso_numero)} className="hover:text-red-600"><Trash2 size={15} /></button></>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.pages > 1 && <div className="flex justify-end items-center gap-2 text-xs text-gray-500"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40">‹</button>{page} / {data.pages}<button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40">›</button></div>}
      </div>
    </div>
  )
}
