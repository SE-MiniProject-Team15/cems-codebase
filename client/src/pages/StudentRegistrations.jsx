import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Link, Navigate } from 'react-router-dom'
import useAuth from '../context/useAuth'
import { cancelRegistration, getMyRegistrations } from '../services/api'
import StudentFeedback from '../components/StudentFeedback'

function formatDate(value) {
  return new Date(value).toLocaleString()
}

function StudentRegistrations() {
  const { user, loading: authLoading } = useAuth()
  const [registrations, setRegistrations] = useState([])
  const [qrCodes, setQrCodes] = useState({})
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [feedbackRegistration, setFeedbackRegistration] = useState(null)

  const loadRegistrations = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await getMyRegistrations({ includePast: true })
      setRegistrations(response.data.registrations)
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || 'Could not load your registrations.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    getMyRegistrations({ includePast: true })
      .then((response) => {
        if (active) setRegistrations(response.data.registrations)
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.message || 'Could not load your registrations.'
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const ticketRegistrations = registrations.filter(
      (registration) => registration.status === 'Registered' && registration.qrPayload
    )

    Promise.all(
      ticketRegistrations.map(async (registration) => [
        registration.id,
        await QRCode.toDataURL(registration.qrPayload, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 220,
        }),
      ])
    )
      .then((entries) => {
        if (active) setQrCodes(Object.fromEntries(entries))
      })
      .catch(() => {
        if (active) setError('Could not generate a ticket QR code. Please refresh to try again.')
      })

    return () => {
      active = false
    }
  }, [registrations])

  async function handleCancel(registration) {
    setCancellingId(registration.id)
    setError('')
    setMessage('')
    try {
      const response = await cancelRegistration(registration.event.id)
      setMessage(
        response.data.promotionNotificationSaved === false
          ? `${response.message} The promoted student could not be notified.`
          : response.message
      )
      await loadRegistrations()
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || 'Could not cancel this registration.'
      )
    } finally {
      setCancellingId(null)
    }
  }

  if (authLoading) {
    return <main className="events-page"><p className="events-status">Loading account...</p></main>
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'Student') return <Navigate to="/login" replace />

  return (
    <main className="events-page">
      <header className="events-header">
        <Link className="events-brand" to="/student/dashboard">CEMS</Link>
        <div>
          <Link to="/events">Browse events</Link>
          <Link to="/student/dashboard">Dashboard</Link>
        </div>
      </header>
      <section className="events-content">
        <div className="events-heading">
          <div>
            <p className="auth-eyebrow">Student</p>
            <h1>My registrations &amp; tickets</h1>
            <p>Your registrations, tickets, and feedback options for attended events.</p>
          </div>
          <button
            className="auth-button secondary-button"
            type="button"
            onClick={loadRegistrations}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="registration-success" role="status">{message}</p>}
        {loading && <p className="events-status">Loading your registrations...</p>}
        {!loading && !error && registrations.length === 0 && (
          <div className="events-empty">
            <h2>No upcoming registrations</h2>
            <p>Registrations and eligible past events will appear here.</p>
            <Link className="auth-button" to="/events">Explore events</Link>
          </div>
        )}

        {!loading && registrations.length > 0 && (
          <div className="registration-grid">
            {registrations.map((registration) => (
              <article className="registration-card" key={registration.id}>
                <p className="event-category">{registration.event.category}</p>
                <h2>
                  <Link to={`/events/${registration.event.id}`}>
                    {registration.event.title}
                  </Link>
                </h2>
                <p><strong>Status:</strong> {registration.status}</p>
                {registration.event.endDateTime &&
                  new Date(registration.event.endDateTime) <= new Date() && (
                    <p><strong>Attendance:</strong> {registration.attendanceStatus}</p>
                  )}
                <p><strong>When:</strong> {formatDate(registration.event.startDateTime)}</p>
                <p><strong>Where:</strong> {registration.event.venue}</p>

                {registration.status === 'Registered' && (
                  <div className="registration-ticket">
                    <h3>Entry ticket</h3>
                    {qrCodes[registration.id]
                      ? <img src={qrCodes[registration.id]} alt={`Entry QR code for ${registration.event.title}`} />
                      : <p>Generating QR code...</p>}
                    <p className="registration-code">
                      Registration code: <code>{registration.registrationCode}</code>
                    </p>
                  </div>
                )}

                {registration.status === 'Registered' &&
                  registration.attendanceStatus === 'Present' &&
                  new Date(registration.event.endDateTime) <= new Date() && (
                    <button
                      className="auth-button"
                      type="button"
                      onClick={() => setFeedbackRegistration(registration)}
                    >
                      Leave Feedback
                    </button>
                  )}

                {new Date(registration.event.startDateTime) > new Date() && <button
                  className="auth-button secondary-button"
                  type="button"
                  onClick={() => handleCancel(registration)}
                  disabled={cancellingId === registration.id}
                >
                  {cancellingId === registration.id
                    ? 'Cancelling...'
                    : registration.status === 'Waitlisted'
                      ? 'Leave waitlist'
                      : 'Cancel registration'}
                </button>}
              </article>
            ))}
          </div>
        )}
      </section>
      {feedbackRegistration && (
        <StudentFeedback
          eventId={feedbackRegistration.event.id}
          eventTitle={feedbackRegistration.event.title}
          onClose={() => setFeedbackRegistration(null)}
        />
      )}
    </main>
  )
}

export default StudentRegistrations
