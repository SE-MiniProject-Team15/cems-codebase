import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { requestPasswordReset, resetPassword } from '../services/api'

function ForgotPassword() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const email = new FormData(event.currentTarget).get('email')
    try {
      const response = await requestPasswordReset(email)
      setMessage(response.message)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not request a password reset.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">College Event Management System</p>
        <h1>Forgot Password?</h1>
        <p className="auth-description">Enter your account email and we’ll send a reset link if it exists.</p>
        <form className="auth-form" onSubmit={handleSubmit} aria-busy={busy}>
          <label htmlFor="reset-email">Email</label>
          <input id="reset-email" name="email" type="email" autoComplete="email" required />
          {message && <p role="status">{message}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-button" type="submit" disabled={busy}>
            {busy ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        <p className="auth-switch"><Link to="/login">Back to login</Link></p>
      </section>
    </main>
  )
}

function ResetPassword() {
  const { token } = useParams()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const password = new FormData(event.currentTarget).get('password')
    try {
      const response = await resetPassword(token, password)
      setMessage(response.message)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not reset the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">College Event Management System</p>
        <h1>Reset your password</h1>
        <form className="auth-form" onSubmit={handleSubmit} aria-busy={busy}>
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            pattern="(?=.*[A-Za-z])(?=.*\d).{8,}"
            required
          />
          {message && <p role="status">{message}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-button" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Reset password'}
          </button>
        </form>
        <p className="auth-switch"><Link to="/login">Back to login</Link></p>
      </section>
    </main>
  )
}

export { ForgotPassword, ResetPassword }
