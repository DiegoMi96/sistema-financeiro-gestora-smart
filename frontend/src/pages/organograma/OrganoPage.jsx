import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orgApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Users, Pencil, Trash2, Plus,
  X, Check, Camera, ZoomIn, ZoomOut, Maximize2, Minimize2,
} from 'lucide-react'

// ── Constantes ─────────────────────────────────────────────────

const MEMBER_TYPES = [
  { value: 'CLT',          label: 'CLT',           color: 'bg-blue-100 text-blue-700' },
  { value: 'PJ',           label: 'PJ',            color: 'bg-green-100 text-green-700' },
  { value: 'Parceiro',     label: 'Parceiro',       color: 'bg-purple-100 text-purple-700' },
  { value: 'Dealer',       label: 'Dealer',         color: 'bg-orange-100 text-orange-700' },
  { value: 'Indicador1',   label: 'Indicador 1',    color: 'bg-teal-100 text-teal-700' },
  { value: 'Indicador2',   label: 'Indicador 2',    color: 'bg-cyan-100 text-cyan-700' },
  { value: 'ProjEspecial', label: 'Proj. Especial', color: 'bg-pink-100 text-pink-700' },
  { value: 'Outro',        label: 'Outro',          color: 'bg-gray-100 text-gray-600' },
  { value: 'Vaga',         label: 'Vaga',           color: 'bg-gray-100 text-gray-400' },
]
const typeColor = (t) => (MEMBER_TYPES.find(m => m.value === t) || MEMBER_TYPES[7]).color
const typeLabel = (t) => (MEMBER_TYPES.find(m => m.value === t) || MEMBER_TYPES[7]).label

const NODE_W   = 130
const LEVEL_H  = 195
const H_GAP    = 52
const CIRC_TOP = 14
const CIRC_D   = 56

// ── Layout automático (Reingold-Tilford simplificado) ──────────

function computeLayout(members) {
  if (!members.length) return {}
  const byId = Object.fromEntries(members.map(m => [m.id, m]))
  const kids  = (id) => members.filter(m => m.parent_id === id).sort((a, b) => (a.sort_order||0) - (b.sort_order||0))
  const roots = members.filter(m => !m.parent_id || !byId[m.parent_id]).sort((a, b) => (a.sort_order||0) - (b.sort_order||0))

  function sw(node) {
    const ch = kids(node.id)
    if (!ch.length) return NODE_W
    return Math.max(NODE_W, ch.reduce((s, c) => s + sw(c), 0) + H_GAP * (ch.length - 1))
  }

  const pos = {}
  function place(node, cx, y) {
    pos[node.id] = { x: cx - NODE_W / 2, y }
    const ch = kids(node.id)
    if (!ch.length) return
    const ws    = ch.map(c => sw(c))
    const total = ws.reduce((s, w) => s + w, 0) + H_GAP * (ch.length - 1)
    let x = cx - total / 2
    ch.forEach((c, i) => { place(c, x + ws[i] / 2, y + LEVEL_H); x += ws[i] + H_GAP })
  }

  const mainRoots = roots.filter(r => kids(r.id).length > 0)
  if (!mainRoots.length) return pos

  const rws   = mainRoots.map(r => sw(r))
  const total = rws.reduce((s, w) => s + w, 0) + H_GAP * (Math.max(0, mainRoots.length - 1))
  let x = -total / 2
  mainRoots.forEach((r, i) => { place(r, x + rws[i] / 2, 0); x += rws[i] + H_GAP })

  // Companions são posicionados dinamicamente no useEffect (dependem da largura do container)
  return pos
}

// ── Canvas infinito ────────────────────────────────────────────

function OrgCanvas({ members, onEdit, canEdit, view, onFullscreen }) {
  const containerRef = useRef(null)
  const [positions, setPositions] = useState({})
  const [pan,  setPan]  = useState({ x: 0, y: 60 })
  const [zoom, setZoom] = useState(0.4)
  const [isDragging, setIsDragging] = useState(false)
  const [guides, setGuides] = useState([])

  // refs para evitar stale closures nos handlers
  const s = useRef({
    pan: { x: 0, y: 60 }, zoom: 0.4, positions: {},
    dragNode: null,  // { id, smx, smy, sx, sy }
    dragPan:  null,  // { smx, smy, spx, spy }
  })

  const layoutKey = useMemo(() => members.map(m => m.id).sort().join(','), [members])
  const isFirst   = useRef(true)

  // refs para acesso sem stale closure nos callbacks de evento
  const viewRef      = useRef(view)
  const layoutKeyRef = useRef(layoutKey)
  viewRef.current      = view
  layoutKeyRef.current = layoutKey

  // Sem persistência de estado — posições e pan sempre recalculados
  const saveCanvasRef = useRef(null)
  saveCanvasRef.current = () => {}

  // Sempre recomputa o layout e centraliza no bounding box a 40%
  useEffect(() => {
    if (!members.length) { setPositions({}); return }

    const layout = computeLayout(members)

    if (containerRef.current) {
      const { width } = containerRef.current.getBoundingClientRect()

      // Identifica companions (raízes sem filhos) — excluídos do cálculo de centralização
      const companionIdSet = new Set(
        members.filter(m => !m.parent_id && !members.some(c => c.parent_id === m.id)).map(m => m.id)
      )
      const mainVals = Object.entries(layout)
        .filter(([id]) => !companionIdSet.has(parseInt(id)))
        .map(([, p]) => p)
      const posVals = mainVals.length ? mainVals : Object.values(layout)
      const allXs = posVals.map(p => p.x)
      const allYs = posVals.map(p => p.y)
      const minX  = Math.min(...allXs)
      const maxX  = Math.max(...allXs) + NODE_W
      const minY  = Math.min(...allYs)

      const newZoom     = 0.4
      const treeCenterX = (minX + maxX) / 2
      const px = width / 2 - treeCenterX * newZoom
      const py = 180 - minY * newZoom

      // Posiciona companions: acima da coluna mais à direita visível (Patrick/Henrique)
      const treeMaxX = Math.max(...allXs) - NODE_W - H_GAP
      const companions = members
        .filter(m => companionIdSet.has(m.id))
        .sort((a, b) => a.id - b.id)  // id negativo (ghost) à esquerda, positivo (diego) à direita
      if (companions.length) {
        companions.forEach((c, i) => {
          const offsetFromRight = companions.length - 1 - i
          layout[c.id] = { x: treeMaxX - offsetFromRight * (NODE_W + H_GAP), y: -LEVEL_H }
        })
      }

      s.current.positions = layout; setPositions(layout)
      s.current.zoom = newZoom; s.current.pan = { x: px, y: py }
      setZoom(newZoom); setPan({ x: px, y: py })
    } else {
      s.current.positions = layout; setPositions(layout)
    }
  }, [layoutKey, view]) // eslint-disable-line

  // Zoom com scroll (zoom em direção ao cursor)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const f  = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const nz = Math.max(0.12, Math.min(3, s.current.zoom * f))
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const ratio = nz / s.current.zoom
      const np = { x: mx - ratio * (mx - s.current.pan.x), y: my - ratio * (my - s.current.pan.y) }
      s.current.zoom = nz; s.current.pan = np
      setZoom(nz); setPan(np)
      saveCanvasRef.current()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onMouseDown = useCallback((e) => {
    // Clique em card → drag do card
    const el = e.target.closest('[data-node]')
    if (el) {
      const id = parseInt(el.dataset.node)
      const p  = s.current.positions[id] || { x: 0, y: 0 }
      s.current.dragNode = { id, smx: e.clientX, smy: e.clientY, sx: p.x, sy: p.y }
      setIsDragging(true); e.preventDefault(); return
    }
    // Fundo → pan
    s.current.dragPan = { smx: e.clientX, smy: e.clientY, spx: s.current.pan.x, spy: s.current.pan.y }
    setIsDragging(true); e.preventDefault()
  }, [])

  const onMouseMove = useCallback((e) => {
    if (s.current.dragNode) {
      const { id, smx, smy, sx, sy } = s.current.dragNode
      const dx = (e.clientX - smx) / s.current.zoom
      const dy = (e.clientY - smy) / s.current.zoom
      const newY = sy + dy
      const np = { ...s.current.positions, [id]: { x: sx + dx, y: newY } }
      s.current.positions = np; setPositions({ ...np })

      // Guias de alinhamento: detecta outras cards na mesma altura (centro do círculo)
      const dragCy = newY + CIRC_TOP + CIRC_D / 2
      const threshold = 8 / s.current.zoom  // 8px de tela
      const found = []
      Object.entries(s.current.positions).forEach(([otherId, op]) => {
        if (parseInt(otherId) === id) return
        const otherCy = op.y + CIRC_TOP + CIRC_D / 2
        if (Math.abs(dragCy - otherCy) < threshold) found.push(otherCy)
      })
      setGuides(found.length ? [{ type: 'h', y: found[0] }] : [])
    } else if (s.current.dragPan) {
      const { smx, smy, spx, spy } = s.current.dragPan
      const np = { x: spx + (e.clientX - smx), y: spy + (e.clientY - smy) }
      s.current.pan = np; setPan(np)
    }
  }, [])

  const onMouseUp = useCallback(() => {
    const wasDragging = !!(s.current.dragNode || s.current.dragPan)
    s.current.dragNode = null; s.current.dragPan = null; setIsDragging(false)
    setGuides([])
    if (wasDragging) saveCanvasRef.current()
  }, [])

  const resetView = useCallback(() => {
    const layout = computeLayout(members)
    if (containerRef.current) {
      const { width } = containerRef.current.getBoundingClientRect()
      const companionIdSet = new Set(
        members.filter(m => !m.parent_id && !members.some(c => c.parent_id === m.id)).map(m => m.id)
      )
      const mainVals = Object.entries(layout)
        .filter(([id]) => !companionIdSet.has(parseInt(id)))
        .map(([, p]) => p)
      const posVals = mainVals.length ? mainVals : Object.values(layout)
      const allXs = posVals.map(p => p.x)
      const allYs = posVals.map(p => p.y)
      const newZoom = 0.4
      const treeCenterX = (Math.min(...allXs) + Math.max(...allXs) + NODE_W) / 2
      const px = width / 2 - treeCenterX * newZoom
      const py = 180 - Math.min(...allYs) * newZoom

      const treeMaxX = Math.max(...allXs) - NODE_W - H_GAP
      const companions = members
        .filter(m => companionIdSet.has(m.id))
        .sort((a, b) => a.id - b.id)
      if (companions.length) {
        companions.forEach((c, i) => {
          const offsetFromRight = companions.length - 1 - i
          layout[c.id] = { x: treeMaxX - offsetFromRight * (NODE_W + H_GAP), y: -LEVEL_H }
        })
      }

      s.current.positions = layout; setPositions(layout)
      s.current.pan = { x: px, y: py }; s.current.zoom = newZoom
      setPan({ x: px, y: py }); setZoom(newZoom)
    }
  }, [members])

  // Linha verde conectando companions (par de fundadores) entre si
  const peerLines = useMemo(() => {
    const byId = Object.fromEntries(members.map(m => [m.id, m]))
    const kidsFn = (id) => members.filter(m => m.parent_id === id)
    const roots  = members.filter(m => !m.parent_id || !byId[m.parent_id])
    if (roots.length <= 1) return []
    const companions = roots.filter(r => kidsFn(r.id).length === 0)
    if (companions.length < 2) return []
    const circMid = CIRC_TOP + CIRC_D / 2
    const placed = companions.map(c => ({ id: c.id, p: positions[c.id] })).filter(x => x.p)
    placed.sort((a, b) => a.p.x - b.p.x)
    const lines = []
    for (let i = 0; i < placed.length - 1; i++) {
      const a = placed[i], b = placed[i + 1]
      lines.push({ x1: a.p.x + NODE_W, y1: a.p.y + circMid, x2: b.p.x, y2: b.p.y + circMid, key: `${a.id}-${b.id}` })
    }
    return lines
  }, [members, positions])

  // Linhas retas estilo org-chart clássico
  // midY é fixo (offset do pai) — não depende da posição dos filhos,
  // então arrastar um card não distorce os outros conectores
  const paths = useMemo(() => {
    const result = []
    const byParent = {}
    members.forEach(m => {
      if (!m.parent_id) return
      if (!byParent[m.parent_id]) byParent[m.parent_id] = []
      byParent[m.parent_id].push(m)
    })
    Object.entries(byParent).forEach(([pid, children]) => {
      const pp = positions[parseInt(pid)]
      if (!pp) return
      const pCx  = pp.x + NODE_W / 2
      const pBot = pp.y + CIRC_TOP + CIRC_D   // base do círculo do pai
      const midY = pBot + 40                   // barra sempre 40px abaixo do pai

      const cps = children.map(c => positions[c.id]).filter(Boolean)
                          .map(cp => ({ cx: cp.x + NODE_W / 2, ty: cp.y + CIRC_TOP }))
      if (!cps.length) return

      // Stem do pai
      result.push(`M${pCx},${pBot} L${pCx},${midY}`)

      // Barra horizontal seguindo as posições reais dos filhos
      const xs = cps.map(c => c.cx)
      const barL = Math.min(pCx, ...xs)
      const barR = Math.max(pCx, ...xs)
      if (barL < barR) {
        result.push(`M${barL},${midY} L${barR},${midY}`)
      }

      // Stem de cada filho: desce/sobe verticalmente do ponto de junção na barra até o card
      cps.forEach(({ cx, ty }) => {
        result.push(`M${cx},${midY} L${cx},${ty}`)
      })
    })
    return result
  }, [members, positions])

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{
        position: 'relative', height: '100%', background: '#ffffff',
        borderRadius: 12, overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        border: '1px solid #e5e7eb',
      }}
    >
      {/* Linhas de conexão */}
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {paths.map((d, i) => (
            <path key={i} d={d} stroke="#d1d5db" strokeWidth={1 / zoom} fill="none" />
          ))}

          {guides.map((g, i) => (
            <line key={`guide-${i}`}
              x1={-20000} y1={g.y} x2={20000} y2={g.y}
              stroke="#3CB54A" strokeWidth={1 / zoom}
              strokeDasharray={`${6 / zoom},${4 / zoom}`} opacity={0.7} />
          ))}

          {peerLines.map(l => (
            <line key={l.key}
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke="#d1d5db" strokeWidth={1 / zoom}
              fill="none" />
          ))}
        </g>
      </svg>

      {/* Cards — mesma transformação via CSS */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        transformOrigin: '0 0',
        transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
        userSelect: 'none',
      }}>
        {/* Cards */}
        {members.map(m => {
          const pos  = positions[m.id]
          if (!pos) return null
          const isVac    = m.is_vacancy || m.member_type === 'Vaga'
          const initials = (m.name || '').split(' ').filter(Boolean).map(w => w[0]).join('').substring(0, 2).toUpperCase()

          return (
            <div
              key={m.id}
              data-node={m.id}
              className="group"
              style={{
                position: 'absolute', left: pos.x, top: pos.y, width: NODE_W, minHeight: 116,
                background: '#fff', borderRadius: 12,
                border: `1.5px solid ${isVac ? '#e5e7eb' : '#d1fae5'}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.03)',
                padding: `${CIRC_TOP}px 10px 12px`,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                cursor: 'grab', overflow: 'hidden',
              }}
            >
              {/* Círculo de foto */}
              <div style={{
                width: CIRC_D, height: CIRC_D, borderRadius: '50%',
                border: isVac ? '2px dashed #d1d5db' : '2px solid #3CB54A',
                background: isVac ? '#f9fafb' : 'rgba(60,181,74,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {m.photo_url && !isVac
                  ? <img src={m.photo_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt={m.name} />
                  : <span style={{ fontSize: 13, fontWeight: 700, color: isVac ? '#9ca3af' : '#3CB54A' }}>
                      {isVac ? '?' : initials}
                    </span>
                }
              </div>

              {/* Nome */}
              <p style={{
                marginTop: 8, fontSize: 11, fontWeight: 600, textAlign: 'center',
                lineHeight: 1.3, color: isVac ? '#9ca3af' : '#111827',
                fontStyle: isVac ? 'italic' : 'normal', width: '100%',
                overflowWrap: 'break-word', wordBreak: 'break-word',
              }}>
                {m.name}
              </p>

              {/* Cargo */}
              <p style={{
                marginTop: 3, fontSize: 10, color: '#6b7280',
                textAlign: 'center', lineHeight: 1.3, width: '100%',
                overflowWrap: 'break-word', wordBreak: 'break-word',
              }}>
                {m.role_title}
              </p>

              {/* Botão editar (hover) — absoluto para não alterar a altura do card */}
              {canEdit && !m._ghost && (
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => onEdit(m)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                    padding: '2px 10px', fontSize: 10, borderRadius: 6,
                    border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280',
                    display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Pencil size={9} /> Editar
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Controles de zoom */}
      <div style={{ position:'absolute', bottom:16, right:16, display:'flex', flexDirection:'column', gap:6, zIndex:10 }}>
        {[
          [ZoomIn,    () => { const z = Math.min(3, s.current.zoom * 1.2); s.current.zoom = z; setZoom(z) }],
          [ZoomOut,   () => { const z = Math.max(0.12, s.current.zoom / 1.2); s.current.zoom = z; setZoom(z) }],
          [Maximize2, onFullscreen],
        ].map(([Icon, action], i) => (
          <button
            key={i}
            onMouseDown={e => e.stopPropagation()}
            onClick={action}
            style={{
              width: 32, height: 32, background: '#fff', border: '1px solid #e5e7eb',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)', cursor: 'pointer', color: '#374151',
            }}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      {/* Indicador de zoom */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        background: 'rgba(255,255,255,0.85)', border: '1px solid #e5e7eb',
        borderRadius: 8, padding: '3px 10px', fontSize: 11, color: '#9ca3af',
        pointerEvents: 'none',
      }}>
        {Math.round(zoom * 100)}%
      </div>

      {/* Dica de uso */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.85)', border: '1px solid #e5e7eb',
        borderRadius: 20, padding: '3px 14px', fontSize: 10, color: '#9ca3af',
        pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        Arraste o fundo para navegar · Scroll para zoom · Segure e mova os cards
      </div>

      {/* Estado vazio */}
      {!members.length && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#9ca3af' }}>
          <Users size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 13 }}>Nenhum membro cadastrado nesta visão.</p>
        </div>
      )}
    </div>
  )
}

// ── Formulário ─────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', role_title: '', department: '', member_type: 'CLT',
  parent_id: '', is_vacancy: false,
  show_in_institucional: true, show_in_comercial: true,
  sort_order: 0, notes: '',
}

function MemberForm({ initial, allMembers, onSave, onCancel, isPending }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const set = k => v => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = () => {
    if (!form.name.trim() || !form.role_title.trim()) { toast.error('Nome e cargo são obrigatórios'); return }
    onSave({ ...form, parent_id: form.parent_id ? Number(form.parent_id) : null, sort_order: Number(form.sort_order) || 0 })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
          <input className="gs-input w-full" value={form.name} onChange={e => set('name')(e.target.value)} placeholder="Ex: João Silva" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Cargo *</label>
          <input className="gs-input w-full" value={form.role_title} onChange={e => set('role_title')(e.target.value)} placeholder="Ex: Gerente de EXP" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Departamento</label>
          <input className="gs-input w-full" value={form.department} onChange={e => set('department')(e.target.value)} placeholder="Ex: Comercial" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
          <select className="gs-input w-full" value={form.member_type} onChange={e => set('member_type')(e.target.value)}>
            {MEMBER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Reporta a</label>
          <select className="gs-input w-full" value={form.parent_id || ''} onChange={e => set('parent_id')(e.target.value)}>
            <option value="">— Raiz (sem superior) —</option>
            {allMembers.filter(m => m.id !== initial?.id).map(m => (
              <option key={m.id} value={m.id}>{m.name} — {m.role_title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ordem</label>
          <input type="number" className="gs-input w-full" value={form.sort_order} onChange={e => set('sort_order')(e.target.value)} min={0} />
        </div>
        <div className="flex flex-col justify-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input type="checkbox" checked={form.is_vacancy} onChange={e => set('is_vacancy')(e.target.checked)} className="rounded" />
            É uma vaga
          </label>
        </div>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-medium text-gray-500 mb-2">Visível em</p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input type="checkbox" checked={form.show_in_institucional} onChange={e => set('show_in_institucional')(e.target.checked)} className="rounded" />
            Institucional
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input type="checkbox" checked={form.show_in_comercial} onChange={e => set('show_in_comercial')(e.target.checked)} className="rounded" />
            Setor Comercial
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Observações</label>
        <textarea className="gs-input w-full" rows={2} value={form.notes || ''} onChange={e => set('notes')(e.target.value)} placeholder="Opcional..." />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
        <button onClick={handleSubmit} disabled={isPending} className="gs-btn gs-btn-dark">
          <Check size={14} />{isPending ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────

function MemberModal({ member, allMembers, onClose }) {
  const qc       = useQueryClient()
  const photoRef = useRef(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: ['org'] })

  const createMut = useMutation({
    mutationFn: (data) => orgApi.create(data),
    onSuccess: () => { invalidate(); toast.success('Membro criado'); onClose() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Erro ao criar'),
  })
  const updateMut = useMutation({
    mutationFn: (data) => orgApi.update(member.id, data),
    onSuccess: () => { invalidate(); toast.success('Membro atualizado'); onClose() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Erro ao salvar'),
  })
  const photoMut = useMutation({
    mutationFn: (fd) => orgApi.uploadPhoto(member.id, fd),
    onSuccess: () => { invalidate(); toast.success('Foto atualizada') },
    onError: () => toast.error('Erro ao enviar foto'),
  })
  const removePhotoMut = useMutation({
    mutationFn: () => orgApi.removePhoto(member.id),
    onSuccess: () => { invalidate(); toast.success('Foto removida') },
    onError: () => toast.error('Erro ao remover foto'),
  })

  const handlePhoto = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file)
    photoMut.mutate(fd); e.target.value = ''
  }

  const isEdit = !!member

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Editar membro' : 'Novo membro'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {isEdit && (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full border-2 border-[#3CB54A] overflow-hidden bg-[#3CB54A]/10 flex items-center justify-center flex-shrink-0">
                {member.photo_url
                  ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.name} />
                  : <span className="text-[#3CB54A] font-bold text-sm">
                      {(member.name || '').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                    </span>
                }
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{member.name}</p>
                <div className="flex items-center gap-3 mt-1">
                  <button onClick={() => photoRef.current?.click()} disabled={photoMut.isPending || removePhotoMut.isPending}
                    className="flex items-center gap-1.5 text-xs text-[#3CB54A] hover:text-[#2a9939] font-medium">
                    <Camera size={12} />{photoMut.isPending ? 'Enviando...' : 'Trocar foto'}
                  </button>
                  {member.photo_url && (
                    <button onClick={() => removePhotoMut.mutate()} disabled={photoMut.isPending || removePhotoMut.isPending}
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 font-medium">
                      <X size={12} />{removePhotoMut.isPending ? 'Removendo...' : 'Remover foto'}
                    </button>
                  )}
                </div>
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </div>
            </div>
          )}
          <MemberForm
            initial={isEdit ? {
              name: member.name, role_title: member.role_title,
              department: member.department || '', member_type: member.member_type,
              parent_id: member.parent_id || '', is_vacancy: member.is_vacancy,
              show_in_institucional: member.show_in_institucional,
              show_in_comercial: member.show_in_comercial,
              sort_order: member.sort_order, notes: member.notes || '',
            } : null}
            allMembers={allMembers}
            onSave={isEdit ? updateMut.mutate : createMut.mutate}
            onCancel={onClose}
            isPending={createMut.isPending || updateMut.isPending}
          />
        </div>
      </div>
    </div>
  )
}

// ── Aba Gerenciar ──────────────────────────────────────────────

function ManageTab({ members, onEdit, onCreate }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const deleteMut = useMutation({
    mutationFn: (id) => orgApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org'] }); toast.success('Removido') },
    onError: () => toast.error('Erro ao remover'),
  })

  const filtered   = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.role_title.toLowerCase().includes(search.toLowerCase())
  )
  const parentName = (id) => { const p = members.find(m => m.id === id); return p ? p.name : '—' }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] gs-card p-2.5 flex items-center gap-2">
          <Users size={14} className="text-gray-400 flex-shrink-0" />
          <input className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
            placeholder="Buscar por nome ou cargo..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={onCreate} className="gs-btn gs-btn-dark"><Plus size={14} /> Novo membro</button>
      </div>

      <div className="gs-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="gs-th" style={{ width:'25%' }}>Nome</th>
                <th className="gs-th" style={{ width:'20%' }}>Cargo</th>
                <th className="gs-th" style={{ width:'13%' }}>Tipo</th>
                <th className="gs-th" style={{ width:'18%' }}>Reporta a</th>
                <th className="gs-th" style={{ width:'14%' }}>Visível em</th>
                <th className="gs-th" style={{ width:'10%' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">Nenhum membro encontrado</td></tr>
              )}
              {filtered.map(m => (
                <tr key={m.id} className="gs-tr border-t border-gray-100">
                  <td className="gs-td">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full border border-[#3CB54A] bg-[#3CB54A]/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {m.photo_url
                          ? <img src={m.photo_url} className="w-full h-full object-cover" alt={m.name} />
                          : <span className="text-[#3CB54A] font-bold" style={{ fontSize: 9 }}>
                              {(m.name || '').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                            </span>
                        }
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900">{m.name}</p>
                        {m.department && <p className="text-xs text-gray-400">{m.department}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="gs-td text-xs text-gray-600">{m.role_title}</td>
                  <td className="gs-td">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${typeColor(m.member_type)}`}>
                      {typeLabel(m.member_type)}
                    </span>
                  </td>
                  <td className="gs-td text-xs text-gray-500">
                    {m.parent_id ? parentName(m.parent_id) : <span className="text-gray-300">Raiz</span>}
                  </td>
                  <td className="gs-td text-xs text-gray-500">
                    <div className="flex gap-1 flex-wrap">
                      {m.show_in_institucional && <span className="px-1 py-0.5 rounded bg-blue-50 text-blue-600 text-xs">Inst.</span>}
                      {m.show_in_comercial     && <span className="px-1 py-0.5 rounded bg-green-50 text-green-600 text-xs">Com.</span>}
                    </div>
                  </td>
                  <td className="gs-td">
                    <div className="flex gap-1">
                      <button onClick={() => onEdit(m)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Pencil size={13} /></button>
                      <button onClick={() => { if (confirm(`Remover "${m.name}"?`)) deleteMut.mutate(m.id) }}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────

export default function OrganoPage() {
  const { can }    = useAuth()
  const { pathname } = useLocation()
  const isManage   = pathname === '/organograma/gerenciar'

  const [view,         setView]         = useState('institucional')
  const [editing,      setEditing]      = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const canEdit = can('can_manage_users')

  useEffect(() => {
    if (!isFullscreen) return
    const onKeyDown = (e) => { if (e.key === 'Escape') setIsFullscreen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isFullscreen])

  const { data: treeInst = [], isLoading: loadInst } = useQuery({
    queryKey: ['org', 'tree', 'institucional'],
    queryFn:  () => orgApi.tree('institucional').then(r => r.data),
    staleTime: 60000,
  })
  const { data: treeCom = [], isLoading: loadCom } = useQuery({
    queryKey: ['org', 'tree', 'comercial'],
    queryFn:  () => orgApi.tree('comercial').then(r => r.data),
    staleTime: 60000,
  })
  const { data: allMembers = [] } = useQuery({
    queryKey: ['org', 'members'],
    queryFn:  () => orgApi.members().then(r => r.data),
    staleTime: 60000,
  })

  const currentTree = view === 'institucional' ? treeInst : treeCom
  const isLoading   = view === 'institucional' ? loadInst : loadCom

  // Injeta ghost do Paulo Attie ao lado de Diego Moleiro como painel de co-fundadores (só no institucional)
  const paulo = view === 'institucional'
    ? currentTree.find(m => !m.parent_id && m.name?.toLowerCase().includes('paulo'))
    : null
  const ghost  = paulo ? { ...paulo, id: -paulo.id, _ghost: true } : null
  const displayTree = ghost ? [...currentTree, ghost] : currentTree

  if (isManage) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="gs-page-title">Gerenciar membros</h1>
          <p className="gs-page-sub">{allMembers.length} colaboradores cadastrados</p>
        </div>
        <ManageTab members={allMembers} onEdit={m => setEditing(m)} onCreate={() => setEditing('new')} />
        {editing && (
          <MemberModal
            member={editing === 'new' ? null : editing}
            allMembers={allMembers}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 className="gs-page-title">Organograma</h1>
          <p className="gs-page-sub">{allMembers.length} colaboradores cadastrados</p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-gray-200">
          {[
            { id: 'institucional', label: 'Institucional' },
            { id: 'comercial',     label: 'Setor Comercial' },
          ].map(({ id, label }, i) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`px-5 py-2 text-sm font-medium transition-colors
                ${view === id ? 'bg-[#3CB54A] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}
                ${i > 0 ? 'border-l border-gray-200' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas — ocupa todo o espaço restante */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {isLoading ? (
          <div className="gs-card flex items-center justify-center" style={{ height: '100%' }}>
            <span className="text-gray-400 text-sm">Carregando organograma...</span>
          </div>
        ) : (
          <OrgCanvas members={displayTree} onEdit={m => setEditing(m)} canEdit={canEdit} view={view} onFullscreen={() => setIsFullscreen(true)} />
        )}
      </div>

      {/* Legenda (Setor Comercial) */}
      {view === 'comercial' && (
        <div className="gs-card p-4" style={{ flexShrink: 0, marginTop: 12 }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Legenda</p>
          <div className="flex flex-wrap gap-2">
            {MEMBER_TYPES.map(t => (
              <span key={t.value} className={`px-2 py-1 rounded-full text-xs font-medium ${t.color}`}>{t.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {editing && (
        <MemberModal
          member={editing === 'new' ? null : editing}
          allMembers={allMembers}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: '#fff', display: 'flex', flexDirection: 'column',
        }}>
          {/* Barra superior */}
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '10px 20px',
            borderBottom: '1px solid #e5e7eb',
          }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Organograma</h2>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{allMembers.length} colaboradores</p>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {[
                { id: 'institucional', label: 'Institucional' },
                { id: 'comercial',     label: 'Setor Comercial' },
              ].map(({ id, label }, i) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors
                    ${view === id ? 'bg-[#3CB54A] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}
                    ${i > 0 ? 'border-l border-gray-200' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                border: '1px solid #e5e7eb', background: '#fff',
                color: '#374151', fontSize: 13, cursor: 'pointer',
              }}
            >
              <Minimize2 size={14} /> Fechar
            </button>
          </div>

          {/* Canvas fullscreen */}
          <div style={{ flex: 1, minHeight: 0, padding: 16 }}>
            <OrgCanvas
              members={displayTree}
              onEdit={m => { setIsFullscreen(false); setEditing(m) }}
              canEdit={canEdit}
              view={view}
              onFullscreen={() => setIsFullscreen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
