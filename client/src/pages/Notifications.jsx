
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import api from '../services/api';

export default function Notifications() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    setError('');

    try {
      const response = await api.get('/notifications');
      const data = response.data?.data?.notifications;
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Could not load notifications. Please try again.'
      );
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
      return;
    }

    if (!loading && user) {
      loadNotifications();
    }
  }, [user, loading, navigate, loadNotifications]);

  async function markAsRead(id) {
    try {
      await api.patch(`/notifications/${id}/read`);

      setNotifications((current) =>
        current.map((item) =>
          item._id === id ? { ...item, read: true } : item
        )
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Could not mark this notification as read.'
      );
    }
  }

  if (loading || loadingNotifications) {
    return <main className="auth-page"><p>Loading notifications...</p></main>;
  }

  return (
    <main className="auth-page">
      <section className="auth-card dashboard-card">
        <p className="auth-eyebrow">College Event Management System</p>
        <h1>Notifications</h1>
        <p>Your latest event updates and announcements.</p>

        <button
          className="auth-button"
          type="button"
          onClick={() =>
            navigate(
              user?.role === 'Organizer'
                ? '/organizer/dashboard'
                : '/student/dashboard'
            )
          }
        >
          Back to Dashboard
        </button>

        <button
          className="auth-button"
          type="button"
          onClick={loadNotifications}
        >
          Refresh
        </button>

        {error && <p role="alert">{error}</p>}

        {!error && notifications.length === 0 && (
          <p>You have no notifications yet.</p>
        )}

        {notifications.map((item) => (
          <article
            key={item._id}
            style={{
              textAlign: 'left',
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '12px',
              marginTop: '12px',
              opacity: item.read ? 0.7 : 1,
            }}
          >
            <h3>{item.title}</h3>
            <p>{item.message}</p>

            <small>
              {item.createdAt
                ? new Date(item.createdAt).toLocaleString()
                : ''}
            </small>

            {!item.read && (
              <button
                className="auth-button"
                type="button"
                onClick={() => markAsRead(item._id)}
              >
                Mark as read
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
