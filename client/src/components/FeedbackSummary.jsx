import { useEffect, useState } from 'react'
import { getEventFeedbackSummary } from '../services/api'
import useDialogAccessibility from './useDialogAccessibility'

function FeedbackSummary({ eventId, eventTitle, onClose }) {
  const dialogRef = useDialogAccessibility(onClose)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getEventFeedbackSummary(eventId)
      .then((response) => {
        if (active) setSummary(response.data)
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.message || 'Could not load event feedback.'
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [eventId])

  return (
    <div className="feedback-backdrop">
      <section
        ref={dialogRef}
        className="feedback-modal feedback-summary-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-summary-title"
        tabIndex={-1}
      >
        <button className="feedback-close" type="button" onClick={onClose} aria-label="Close feedback summary">
          ×
        </button>
        <p className="auth-eyebrow">Anonymous event feedback</p>
        <h2 id="feedback-summary-title">{eventTitle}</h2>
        {loading && <p>Loading feedback...</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {summary && (
          <>
            <div className="feedback-metrics">
              <div>
                <strong>Average rating</strong>
                <span>{summary.averageRating.toFixed(2)} / 5</span>
                <span className="feedback-average-stars" aria-label={`${summary.averageRating} out of 5 stars`}>
                  {'★'.repeat(Math.round(summary.averageRating))}
                  {'☆'.repeat(5 - Math.round(summary.averageRating))}
                </span>
              </div>
              <div>
                <strong>Total responses</strong>
                <span>{summary.totalResponses}</span>
              </div>
            </div>
            <h3>Rating distribution</h3>
            <ul className="feedback-distribution">
              {[5, 4, 3, 2, 1].map((rating) => (
                <li key={rating}>
                  <span>{rating} stars</span>
                  <span>{summary.ratingDistribution[rating] || 0}</span>
                </li>
              ))}
            </ul>
            <h3>Comments</h3>
            {summary.comments.length === 0
              ? <p>No comments have been submitted.</p>
              : (
                <ul className="feedback-comments">
                  {summary.comments.map((item, index) => (
                    <li key={`${item.submittedAt}-${index}`}>
                      <p aria-label={`${item.rating} out of 5 stars`}>
                        {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                      </p>
                      <p>{item.comment}</p>
                    </li>
                  ))}
                </ul>
              )}
          </>
        )}
      </section>
    </div>
  )
}

export default FeedbackSummary
