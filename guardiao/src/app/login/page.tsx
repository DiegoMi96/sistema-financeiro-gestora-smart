"use client"

// Login unificado (31/07/2026): o Guardião não tem mais tela de login própria.
// Formulário original do Thalles preservado em login/page.original.tsx.txt
// (referência, não usado). Quem chegar aqui é enviado para o login do
// sistema principal — a sessão volta a valer para o Guardião automaticamente
// (mesma origem, mesmo localStorage 'token'/'user').
import { useEffect } from "react"

export default function LoginPage() {
  useEffect(() => {
    window.location.href = "/"
  }, [])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <p className="text-muted-foreground">Redirecionando para o login...</p>
    </div>
  )
}
