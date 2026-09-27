import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useModule } from '../../contexts/ModuleContext'
import { useAuth } from '../../contexts/AuthContext'

export default function ComissionamentoDashboard() {
  const navigate = useNavigate()
  const { availableModules, clearModule } = useModule()
  const { logout } = useAuth()

  // Cache-buster: mesmo motivo da Controladoria — HTML estático servido em
  // iframe, sem isto o navegador reusa a versão em cache do iframe mesmo após
  // deploy. useState com initializer = calculado 1x por montagem.
  const [iframeSrc] = useState(() => `/comissionamento/?v=${Date.now()}`)

  useEffect(() => {
    const handler = (e) => {
      // TROCAR_MODULO só faz sentido com mais de um módulo disponível — o
      // botão do sidebar do Comissionamento nem aparece nesse caso, mas o
      // guard fica aqui também por segurança.
      if (e.data?.type === 'TROCAR_MODULO' && availableModules.length > 1) {
        clearModule()
        navigate('/')
      }
      // LOGOUT usa o logout() de verdade do AuthContext (limpa o estado em
      // memória, não só o localStorage) — sem isso, o app principal
      // continuaria "logado" na memória depois de sair pelo iframe.
      if (e.data?.type === 'LOGOUT') {
        logout()
        navigate('/login')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [availableModules, clearModule, navigate, logout])

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
