import { X } from 'lucide-react'

export const brl = v => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dataBR = iso => (iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—')
export const horaBR = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export const STATUS = {
  pendente:    { rotulo: 'Aguardando aprovação', cls: 'bg-amber-50 text-amber-800' },
  aprovado:    { rotulo: 'Aprovado, na fila de envio', cls: 'bg-blue-50 text-blue-700' },
  enviando:    { rotulo: 'Enviando', cls: 'bg-blue-50 text-blue-700' },
  enviado:     { rotulo: 'Enviado', cls: 'bg-green-50 text-green-700' },
  falhou:      { rotulo: 'Falhou', cls: 'bg-red-50 text-red-700' },
  devolvido:   { rotulo: 'E-mail devolvido', cls: 'bg-red-50 text-red-700' },
  sem_contato: { rotulo: 'Sem e-mail', cls: 'bg-red-50 text-red-700' },
  sem_boleto:  { rotulo: 'Aguardando boleto', cls: 'bg-amber-50 text-amber-800' },
  resolvido:   { rotulo: 'Resolvido (pagou)', cls: 'bg-gray-100 text-gray-600' },
  cancelado:   { rotulo: 'Removido', cls: 'bg-gray-100 text-gray-600' },
  concluido:   { rotulo: 'Concluído', cls: 'bg-green-50 text-green-700' },
}

export const ENTREGA = {
  processando: { rotulo: 'Enviando à Umbler', cls: 'bg-gray-100 text-gray-600' },
  enviada:     { rotulo: 'Enviada', cls: 'bg-blue-50 text-blue-700' },
  entregue:    { rotulo: 'Entregue', cls: 'bg-green-50 text-green-700' },
  lida:        { rotulo: 'Lida', cls: 'bg-green-100 text-green-800' },
  falhou:      { rotulo: 'Falhou na entrega', cls: 'bg-red-50 text-red-700' },
}

export function EntregaChip({ entrega, erro }) {
  if (!entrega) return null
  const s = ENTREGA[entrega] || { rotulo: entrega, cls: 'bg-gray-100 text-gray-600' }
  return <span title={erro || ''} className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>{s.rotulo}</span>
}

export function Chip({ status }) {
  const s = STATUS[status] || { rotulo: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>{s.rotulo}</span>
}

export function Modal({ titulo, onClose, children, largo }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl w-full ${largo ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <p className="font-semibold text-gray-800">{titulo}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Confirmar({ titulo, texto, aviso, rotulo = 'Confirmar', perigo, ocupado, onOk, onClose }) {
  return (
    <Modal titulo={titulo} onClose={onClose}>
      <p className="text-sm text-gray-600 whitespace-pre-line">{texto}</p>
      {aviso && <p className="text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2 mt-3">{aviso}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200">Cancelar</button>
        <button onClick={onOk} disabled={ocupado} className={`text-sm px-3 py-1.5 rounded-lg text-white disabled:opacity-40 ${perigo ? 'bg-red-600' : 'bg-green-600'}`}>
          {ocupado ? 'Aguarde…' : rotulo}
        </button>
      </div>
    </Modal>
  )
}
