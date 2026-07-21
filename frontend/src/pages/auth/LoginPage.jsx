import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [logo, setLogo]           = useState(null)
  const [logoLoaded, setLogoLoaded] = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  useEffect(() => {
    fetch('/api/settings/public')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.empresa_logo) setLogo(d.empresa_logo)
        setLogoLoaded(true)
      })
      .catch(() => setLogoLoaded(true))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await login(email, password)
      toast.success(`Bem-vindo, ${user.name}!`)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #060E07 0%, #0D1F10 100%)' }}>

      {/* Logo */}
      <div className="text-center" style={{ marginBottom: logo ? -30 : 16, minHeight: 80 }}>
        {logo ? (
          <img src={logo} alt="Logo" style={{ height: 260, maxWidth: 480, objectFit: 'contain', objectPosition: 'center top' }} />
        ) : logoLoaded ? (
          <div>
            <p style={{ color: '#9CA3AF', fontSize: '10px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' }}>GESTORA</p>
            <p style={{ color: '#FFFFFF', fontSize: '36px', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>SMART</p>
            <div style={{ background: '#3CB54A', borderRadius: '3px', padding: '2px 8px', marginTop: '4px', display: 'inline-block' }}>
              <p style={{ color: '#FFFFFF', fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em' }}>SIMCARD | HARDWARE | SOFTWARE</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Card */}
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Entrar na conta</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3CB54A] focus:border-transparent"
                placeholder="seu@email.com.br"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3CB54A] focus:border-transparent"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              style={{ background: loading ? '#2a8535' : '#3CB54A' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#2ea040' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#3CB54A' }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#3d5e40' }}>
          © {new Date().getFullYear()} Gestora Smart. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
