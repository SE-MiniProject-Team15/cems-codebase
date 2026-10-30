import { useEffect, useState } from 'react'
import { getStudentFeedback, submitFeedback } from '../services/api'

function StudentFeedback({ eventId, eventTitle, onClose }) {
  const [feedback, setFeedback] = useState(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getStudentFeedback(eventId)
      .then((response) => {
        if (active) setFeedback(response.data.feedback)
      })
      .catch((requestError) => {
        if (!active) return
        if (requestError.response?.status !== 404) {
          setError(
            requestError.response?.data?.message || 'Could not load your feedback.'
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

  async function handleSubmit(event) {
    event.preventDefault()
    if (rating < 1 || rating > 5 || submitting) return

    setSubmitting(true)
    setError('')
    try {
      const response = await submitFeedback(eventId, { rating, comment })
      setFeedback(response.data.feedback)
    } catch (requestError) {
      const existing = requestError.response?.data?.data?.feedback
      if (requestError.response?.status === 409 && existing) {
        setFeedback(existing)
      } else {
        setError(
          requestError.response?.data?.message || 'Could not submit feedback. Please try again.'
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="feedback-backdrop">
      <section
        className="feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-feedback-title"
      >
        <button className="feedback-close" type="button" onClick={onClose} aria-label="Close feedback">
          ×
        </button>
        <p className="auth-eyebrow">Event feedback</p>
        <h2 id="student-feedback-title">{eventTitle}</h2>
        {loading && <p>Loading your feedback...</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}

        {!loading && feedback && (
          <div className="feedback-readonly">
            <p><strong>Your rating:</strong> <span aria-label={`${feedback.rating} out of 5 stars`}>{'★'.repeat(feedback.rating)}{'☆'.repeat(5 - feedback.rating)}</span></p>
            <p><strong>Your comment:</strong></p>
            <p className="feedback-comment">{feedback.comment || 'No comment was provided.'}</p>
            <p className="feedback-readonly-note">Your feedback has been submitted and can no longer be changed.</p>
          </div>
        )}

        {!loading && !feedback && (
          <form className="feedback-form" onSubmit={handleSubmit}>
            <fieldset>
              <legend>Rating (required)</legend>
              <div className="feedback-stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    className={value <= rating ? 'feedback-star selected' : 'feedback-star'}
                    type="button"
                    aria-label={`${value} star${value === 1 ? '' : 's'}`}
                    aria-pressed={rating === value}
                    onClick={() => setRating(value)}
                  >
                    {value <= rating ? '★' : '☆'}
                  </button>
                ))}
              </div>
            </fieldset>
            <label htmlFor="feedback-comment">Comment (optional)</label>
            <textarea
              id="feedback-comment"
              maxLength={1000}
              rows={5}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            <p className="feedback-character-count">{comment.length}/1000 characters</p>
            <button className="auth-button" type="submit" disabled={rating === 0 || submitting}>
              {submitting ? 'Submitting...' : 'Submit feedback'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

export default StudentFeedback
