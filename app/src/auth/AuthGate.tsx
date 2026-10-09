import type { ReactNode } from 'react'
import { AuthContext } from './AuthContext'

export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: null, demoMode: true }}>
      {children}
    </AuthContext.Provider>
  )
}
