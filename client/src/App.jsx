import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import OrganizerEvents from './pages/OrganizerEvents';
import StudentEvents from './pages/StudentEvents';
import Notifications from './pages/Notifications';
import { EventBrowser, EventDetails } from './pages/Events';
import useAuth from './context/useAuth';
import './App.css';

function Dashboard({ role }) {
  const { user, loading, logout } = useAuth();

  if (loading) return <main className="auth-page"><p>Loading your account...</p></main>;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== role) {
    const dashboards = {
      Student: '/student/dashboard',
      Organizer: '/organizer/dashboard',
      Admin: '/admin/dashboard',
    };
    return <Navigate to={dashboards[user.role] || '/login'} replace />;
  }

  return (
    <main className="auth-page">
      <section className="auth-card dashboard-card">
        <p className="auth-eyebrow">College Event Management System</p>
        <h1>{role} Dashboard</h1>
        <p>Welcome, {user.name}.</p>
        {role === 'Student' && <Link className="auth-button" to="/events">Explore Events</Link>}
        {role === 'Organizer' && <Link className="auth-button" to="/organizer/events">Manage Events</Link>}
        <Link className="auth-button" to="/notifications">View Notifications</Link>
        <button className="auth-button" type="button" onClick={logout}>Log out</button>
      </section>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/student/dashboard" element={<Dashboard role="Student" />} />
      <Route path="/organizer/dashboard" element={<Dashboard role="Organizer" />} />
      <Route path="/admin/dashboard" element={<Dashboard role="Admin" />} />
      <Route path="/student/events" element={<StudentEvents />} />
      <Route path="/organizer/events" element={<OrganizerEvents />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/events" element={<EventBrowser />} />
      <Route path="/events/:eventId" element={<EventDetails />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
