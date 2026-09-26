import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useModule } from '../../contexts/ModuleContext'

export default function ComissionamentoDashboard() {
  const navigate = useNavigate()
  const { availableModules, clearModule } = useModule()

  // Cache-buster: mesmo motivo da Controladoria — HTML estático servido em
  // iframe, sem isto o navegador reusa a versão em cache do iframe mesmo após
  // deploy. useState com initializer = calculado 1x por montagem.
  const [iframeSrc] = useState(() => `/comissionamento/?v=${Date.now()}`)

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
        title="Comissionamento"
      />
    </div>
  )
}
