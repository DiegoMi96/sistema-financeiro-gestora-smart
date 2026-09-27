import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [lembrar, setLembrar]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

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
    // min-h-[100dvh] (não 100vh) + overflow-y-auto: em celular, 100vh conta a
    // barra de endereço do navegador como altura disponível e o conteúdo
    // cortava embaixo (rodapé/copyright fora da tela, sem como rolar até
    // ele). dvh usa a altura real visível; overflow-y-auto garante rolagem
    // em telas baixas o suficiente pra não caber mesmo (ex: celular deitado).
    <div className="min-h-[100dvh] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'linear-gradient(135deg, #060E07 0%, #0D1F10 100%)' }}>

      {/* Logo + card tratados como um bloco único (pedido do Diego) — um só
          flex column, centralizado como grupo, sem depender de margem
          negativa pra "colar" os dois.

          O arquivo logo-smart-white.png tem ~38% de espaço transparente
          acima da marca e ~35% abaixo (medido via canvas) — isso faz a caixa
          da logo ficar centralizada mas o "peso visual" (a marca em si)
          sobrar pro fundo, deixando o bloco com aparência de estar mais
          baixo que o centro real da tela, mesmo estando matematicamente
          centralizado. Corrigido deslocando o BLOCO INTEIRO um pouco pra
          cima (a logo continua no tamanho normal, sem cortar nada) — tentei
          cortar o espaço vazio da logo antes, mas isso deixava a marca
          visivelmente menor; o Diego pediu pra manter o tamanho original. */}
      <div className="w-full max-w-md flex flex-col items-center -translate-y-6 sm:-translate-y-8 md:-translate-y-10">
        {/* Logo estática (letra clara, fundo transparente) — feita para o
            fundo escuro desta tela. Independente da logo de Configurações.
            Altura responsiva (menor em celular, maior em telas grandes) —
            antes era um valor fixo (260px) que não cabia em telas baixas.
            Tamanho 1,5x maior e mais próxima do card (pedido do Diego, em
            cima do que já estava no ar: h-32/44/56 → 1,5x = 192/264/336px;
            margem -16/-24 → 1,5x = -24/-36). */}
        <img
          src="/logo-smart-white.png"
          alt="Gestora Smart"
          className="h-[192px] sm:h-[264px] md:h-[336px] w-auto object-contain mb-[-24px] sm:mb-[-36px]"
          style={{ maxWidth: '100%' }}
        />

        {/* Card — vidro escuro flutuando sobre o fundo verde, no molde pedido
            pelo Diego (referência: comunidade.filosofiadozero.com.br), mas com
            a paleta verde/branco do sistema no lugar do vermelho/dourado deles. */}
        <div className="w-full">
          <div
            className="relative rounded-2xl p-8 overflow-hidden"
            style={{
              background: 'rgba(13,31,16,0.55)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid rgba(60,181,74,0.22)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
            }}
          >
          {/* Tarja fina no topo — degradê verde animado (desliza continuamente,
              mesmo efeito da referência que o Diego mandou). Keyframe global
              em index.css (login-bar-slide) porque style inline não suporta
              @keyframes. */}
          <div
            className="absolute top-0 left-0 right-0 login-bar-slide"
            style={{
              height: 4,
              background: 'linear-gradient(90deg, #0b3d2a, #1E9B6B, #7ED9A5, #1E9B6B, #0b3d2a)',
              backgroundSize: '200% 100%',
            }}
          />

          <div className="text-center mb-7">
            <h2 className="text-2xl font-bold text-white mb-1.5">Bem-vindo de volta</h2>
            <p className="text-sm" style={{ color: '#9db8a3' }}>Entre para acessar o sistema</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#c9dccb' }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-shadow"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(60,181,74,0.5)'}
                onBlur={e => e.currentTarget.style.boxShadow = 'none'}
                placeholder="seu@email.com.br"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#c9dccb' }}>
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-shadow"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(60,181,74,0.5)'}
                  onBlur={e => e.currentTarget.style.boxShadow = 'none'}
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

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: '#c9dccb' }}>
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={e => setLembrar(e.target.checked)}
                  className="rounded"
                  style={{ accentColor: '#3CB54A' }}
                />
                Lembrar de mim
              </label>
              <button
                type="button"
                onClick={() => toast('Recuperação de senha ainda não está disponível — fale com o administrador.')}
                className="font-medium hover:underline"
                style={{ color: '#7ED9A5' }}
              >
                Esqueceu a senha?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-semibold py-2.5 rounded-lg text-sm transition-opacity disabled:opacity-50 login-bar-slide"
              style={{
                background: 'linear-gradient(90deg, #0b3d2a, #1E9B6B, #7ED9A5, #1E9B6B, #0b3d2a)',
                backgroundSize: '200% 100%',
              }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: '#5c7a60' }}>
            © {new Date().getFullYear()} Gestora Smart. Todos os direitos reservados.
          </p>
          </div>
        </div>
      </div>
    </div>
  )
}
