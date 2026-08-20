import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Estado começa undefined (server e client renderizam igual) e só é resolvido
  // depois de montado, quando `window` existe — necessário pra não quebrar a
  // hidratação. Por isso o setState síncrono dentro do efeito é intencional.
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza o valor inicial de um media query; ver comentário acima
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
