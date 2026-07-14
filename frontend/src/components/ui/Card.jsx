/**
 * Card — padrão visual do Gestora Smart
 * Fundo branco, borda #EBEBEB, border-radius 14px, sombra sutil.
 *
 * Props:
 *  className  — classes extras
 *  style      — estilos inline extras
 *  highlight  — 'green' | 'blue' | 'amber' | 'red'  → borda colorida
 *  padding    — false para remover o padding padrão
 *  children
 */
export default function Card({ children, className = '', style = {}, highlight, padding = true }) {
  const borderColor = {
    green: '#22C55E',
    blue:  '#3B82F6',
    amber: '#F59E0B',
    red:   '#EF4444',
  }[highlight] || '#EBEBEB'

  const borderWidth = highlight ? '1.5px' : '1px'

  return (
    <div
      className={className}
      style={{
        background:   '#FFFFFF',
        border:       `${borderWidth} solid ${borderColor}`,
        borderRadius: 14,
        padding:      padding ? '20px 24px' : undefined,
        boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Card compacto para KPI — label + valor */
export function KpiCard({ label, value, highlight, icon: Icon, sub }) {
  const valueColor = {
    green: '#16A34A',
    blue:  '#2563EB',
    amber: '#D97706',
    red:   '#DC2626',
  }[highlight] || '#1A1A1A'

  return (
    <Card highlight={highlight} style={{ padding: '16px 18px' }}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500, marginBottom: 6 }}>{label}</p>
          <p style={{ fontSize: 17, fontWeight: 700, color: valueColor, letterSpacing: '-0.4px', lineHeight: 1.2 }}>
            {value}
          </p>
          {sub && (
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{sub}</p>
          )}
        </div>
        {Icon && (
          <div style={{ background: '#F5F6FA', borderRadius: 10, padding: 8, flexShrink: 0 }}>
            <Icon size={16} style={{ color: '#9CA3AF' }} />
          </div>
        )}
      </div>
    </Card>
  )
}
