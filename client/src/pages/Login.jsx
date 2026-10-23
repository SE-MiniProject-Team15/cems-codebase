import { useState } from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../context/useAuth'

function Login() {
  const { login, error } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email')
    const password = formData.get('password')

    try {
      // AuthContext handles state setting AND navigation internally
      await login({ email, password })
    } catch (requestError) {
      setFormError(
        requestError.response?.data?.message
          || requestError.message
          || error
          || 'Unable to log in. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">College Event Management System</p>
        <h1>Welcome back</h1>
        <p className="auth-description">Log in to find and manage campus events.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          {(formError || error) && (
            <p className="auth-error" role="alert">{formError || error}</p>
          )}
          <button className="auth-button" type="submit" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          New to CEMS? <Link to="/register">Create an account</Link>
        </p>
      </section>
    </main>
  )
}

export default Login