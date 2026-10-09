import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

export interface AuthContextValue {
  user: User | null
  demoMode: boolean
}

export const AuthContext = createContext<AuthContextValue>({ user: null, demoMode: false })

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
