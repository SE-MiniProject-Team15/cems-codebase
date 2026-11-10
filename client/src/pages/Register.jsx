
import { useState } from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../context/useAuth'

const passwordPolicy = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

function Register() {
  const { register, error } = useAuth()
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const form = event.currentTarget
    const formData = new FormData(form)

    const name = formData.get('name')?.toString().trim()
    const email = formData.get('email')?.toString().trim()
    const password = formData.get('password')?.toString() ?? ''
    const role = formData.get('role')?.toString() ?? 'Student'

    if (!name || !email) {
      setFormError('Please enter your name and email address.')
      return
    }

    if (!passwordPolicy.test(password)) {
      document.getElementById('register-password')?.focus()
      setFormError(
        'Password must be at least 8 characters and contain at least one letter and one digit.'
      )
      return
    }

    setSubmitting(true)

    try {
      await register({
        name,
        email,
        password,
        role,
      })
    } catch {
      // The authentication context exposes the backend error.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">
          College Event Management System
        </p>

        <h1>Create your account</h1>

        <p className="auth-description">
          Join your campus community and discover upcoming events.
        </p>

        <form aria-busy={submitting} className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="register-name">Name</label>
          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="name"
            required
          />

          <label htmlFor="register-email">College Email</label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />

          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            aria-describedby="password-hint"
            aria-invalid={formError.includes('Password') || undefined}
            required
          />

          <p className="auth-hint" id="password-hint">
            At least 8 characters, including a letter and a number.
          </p>

          <label htmlFor="register-role">Role</label>
          <select
            id="register-role"
            name="role"
            defaultValue="Student"
          >
            <option value="Student">Student</option>
            <option value="Organizer">Organizer</option>
          </select>

          {(formError || error) && (
            <p className="auth-error" role="alert">
              {formError || error}
            </p>
          )}

          <button
            className="auth-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </section>
    </main>
  )
}

export default Register
