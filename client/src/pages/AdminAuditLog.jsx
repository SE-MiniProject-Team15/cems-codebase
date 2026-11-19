import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import useAuth from '../context/useAuth'
import { getAdminAuditLogs } from '../services/api'

const dateTime = (value) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value))

function AdminAuditLog() {
  const { user, loading } = useAuth()
  const [auditLogs, setAuditLogs] = useState([])
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (loading || user?.role !== 'Admin') return undefined
    let active = true
    getAdminAuditLogs()
      .then((response) => {
        if (active) setAuditLogs(response.data.auditLogs)
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Could not load the audit log.')
      })
      .finally(() => {
        if (active) setFetching(false)
      })
    return () => { active = false }
  }, [loading, user])

  if (loading) return <main className="events-page"><p role="status">Loading account...</p></main>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'Admin') return <Navigate to="/login" replace />

  return (
    <main id="main-content" tabIndex={-1} className="events-page">
      <header className="events-header">
        <Link className="events-brand" to="/admin/dashboard">CEMS</Link>
        <Link to="/admin/dashboard">Dashboard</Link>
      </header>
      <section className="events-content attendance-content">
        <p className="auth-eyebrow">Administrator</p>
        <h1>Audit Log</h1>
        <p>Approval decisions and attendance check-ins are recorded as append-only entries.</p>
        {fetching && <p role="status">Loading audit entries...</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!fetching && !error && auditLogs.length === 0 && <p>No audit entries yet.</p>}
        {auditLogs.length > 0 && (
          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Affected entity</th>
                  <th scope="col">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((entry) => (
                  <tr key={entry._id}>
                    <td>{entry.actor?.name || entry.actor?.email || 'Unknown actor'}</td>
                    <td>{entry.action}</td>
                    <td>{entry.targetType}: {entry.event?.title || entry.details?.studentId || entry.targetId}</td>
                    <td>{dateTime(entry.timestamp || entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default AdminAuditLog
