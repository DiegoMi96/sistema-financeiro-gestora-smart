import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function ControladoriaDashboard() {
  const navigate = useNavigate()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      <button
        onClick={() => navigate('/')}
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10000,
          background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
          fontWeight: 600, backdropFilter: 'blur(6px)', letterSpacing: '.01em',
        }}
      >
        <ArrowLeft size={14} /> Voltar
      </button>
      <iframe
        src="/controladoria/"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Controladoria"
      />
    </div>
  )
}
