import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useModule } from '../../contexts/ModuleContext'

export default function ControladoriaDashboard() {
  const navigate = useNavigate()
  const { availableModules, clearModule } = useModule()

  // Cache-buster: o dashboard da Controladoria é um HTML estático servido em
  // iframe. Sem isto, o navegador reusa a versão em cache do iframe mesmo após
  // deploy (o Ctrl+Shift+R da página pai não força o reload do iframe). Um
  // valor novo a cada abertura garante que sempre carrega a versão atual.
  // useState com initializer = calculado 1x por montagem (não recarrega em loop).
  const [iframeSrc] = useState(() => `/controladoria/?v=${Date.now()}`)

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
        src={iframeSrc}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Controladoria"
      />
    </div>
  )
}
