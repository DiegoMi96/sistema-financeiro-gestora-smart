import { useNavigate } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { useModule } from '../../contexts/ModuleContext'

export default function ControladoriaDashboard() {
  const navigate = useNavigate()
  const { availableModules, clearModule } = useModule()

  const handleTrocar = () => { clearModule(); navigate('/') }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      <iframe
        src="/controladoria/"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Controladoria"
      />
      {availableModules.length > 1 && (
        <button
          onClick={handleTrocar}
          style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10000,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            color: '#6B7280', border: '1px dashed #9CA3AF',
            background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(6px)',
            cursor: 'pointer', transition: 'background 0.15s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(243,244,246,0.95)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.9)'}
        >
          <LayoutGrid size={14} />
          Trocar módulo
        </button>
      )}
    </div>
  )
}
