import type { Metadata } from 'next'
import { Karla } from 'next/font/google'
import NextTopLoader from "nextjs-toploader"
import "../styles/globals.css"

const karla = Karla({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-karla',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Guardião - Sistema de Controle de Consumo',
  description: 'Sistema de controle de consumo de linhas móveis para a Gestora SMART',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={karla.variable}>
      <body className={karla.className}>
        <NextTopLoader color="#7ABA4F" showSpinner={false} />
        {children}
      </body>
    </html>
  )
}
