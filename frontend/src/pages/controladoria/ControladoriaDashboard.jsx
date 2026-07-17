import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useModule } from '../../contexts/ModuleContext'

export default function ControladoriaDashboard() {
  const navigate = useNavigate()
  const { availableModules, clearModule } = useModule()

  useEffect(() => {
    if (availableModules.length <= 1) return
    const handler = (e) => {
      if (e.data?.type === 'TROCAR_MODULO') {
        clearModule()
        navigate('/')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [availableModules, clearModule, navigate])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      <iframe
        src="/controladoria/"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Controladoria"
      />
    </div>
  )
}
