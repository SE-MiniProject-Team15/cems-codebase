import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthContext from './authContext'
import { getDashboardPath, normalizeAuthUser } from './authUtils'
import {
  getCurrentUser,
  loginUser as loginRequest,
  logoutUser as logoutRequest,
  registerUser as registerRequest,
} from '../services/api'

function getErrorMessage(error) {
  return error.response?.data?.message || error.message || 'An unexpected error occurred'
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    getCurrentUser()
      .then((response) => {
        if (active) {
          setUser(normalizeAuthUser(response))
        }
      })
      .catch((requestError) => {
        if (active && requestError.response?.status !== 401) {
          setError(getErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (credentials) => {
    setError(null)
    try {
      const response = await loginRequest(credentials)
      
      // Do not pass credentials.role (it is undefined on login forms)
      const authenticatedUser = normalizeAuthUser(response)

      if (!authenticatedUser) {
        throw new Error('The login response did not include a user')
      }

      setUser(authenticatedUser)

      const dashboardPath = getDashboardPath(authenticatedUser)
      if (dashboardPath) {
        navigate(dashboardPath, { replace: true })
      }
      return authenticatedUser
    } catch (requestError) {
      setError(getErrorMessage(requestError))
      throw requestError
    }
  }, [navigate])

  const register = useCallback(async (userData) => {
    setError(null)
    try {
      await registerRequest(userData)
      setUser(null)
      navigate('/login', {
        replace: true,
        state: { registrationSuccess: true },
      })
      return null
    } catch (requestError) {
      setError(getErrorMessage(requestError))
      throw requestError
    }
  }, [navigate])

  const logout = useCallback(async () => {
    setError(null)
    try {
      await logoutRequest()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
      throw requestError
    } finally {
      setUser(null)
      navigate('/login', { replace: true })
    }
  }, [navigate])

  const value = useMemo(() => ({ user, loading, error, login, register, logout }), [
    user,
    loading,
    error,
    login,
    register,
    logout,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider