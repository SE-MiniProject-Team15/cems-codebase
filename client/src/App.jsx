import AdminEventReview from './pages/AdminEventReview';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import OrganizerEvents from './pages/OrganizerEvents';
import StudentEvents from './pages/StudentEvents';
import Notifications from './pages/Notifications';
import { AdminAttendance, OrganizerAttendance } from './pages/Attendance';
import { EventBrowser, EventDetails } from './pages/Events';
import StudentRegistrations from './pages/StudentRegistrations';
import { ForgotPassword, ResetPassword } from './pages/PasswordRecovery';
import AdminAuditLog from './pages/AdminAuditLog';
import { AdminFeedback, OrganizerFeedback, StudentFeedback } from './pages/Feedback';
import useAuth from './context/useAuth';
import './App.css';
import RouteAccessibility from './components/RouteAccessibility';

function Dashboard({ role }) {
  const { user, loading, logout } = useAuth()

  if (loading) return <main id="main-content" tabIndex={-1} className="auth-page"><p>Loading your account...</p></main>;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== role) {
    const dashboard = {
      Student: '/student/dashboard',
      Organizer: '/organizer/dashboard',
      Admin: '/admin/dashboard',
    }[user.role]
    return <Navigate to={dashboard || '/login'} replace />
  }

  return (
    <main id="main-content" tabIndex={-1} className="auth-page">
      <section className="auth-card dashboard-card">
        <p className="auth-eyebrow">College Event Management System</p>
        <h1>{role} Dashboard</h1>
        <p>Welcome, {user.name}.</p>
        {role === 'Student' && <Link className="auth-button" to="/events">Explore Events</Link>}
        {role === 'Student' && <Link className="auth-button" to="/registrations">My Registrations &amp; Tickets</Link>}
        {role === 'Student' && <Link className="auth-button" to="/student/feedback">My Event Feedback</Link>}
        {role === 'Organizer' && <Link className="auth-button" to="/organizer/events">Manage Events</Link>}
        {role === 'Organizer' && <Link className="auth-button" to="/organizer/feedback">Event Feedback</Link>}
        {role === 'Admin' && <Link className="auth-button" to="/admin/events/review">Review events</Link>}
        {role === 'Admin' && <Link className="auth-button" to="/admin/attendance">View attendance</Link>}
        {role === 'Admin' && <Link className="auth-button" to="/admin/feedback">Feedback summary</Link>}
        {role === 'Admin' && <Link className="auth-button" to="/admin/audit-log">Audit Log</Link>}
        <Link className="auth-button" to="/notifications">View Notifications</Link>
        <button className="auth-button" type="button" onClick={logout}>Log out</button>
      </section>
    </main>
  )
}

function App() {
  return (
    <>
    <RouteAccessibility />
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/student/dashboard" element={<Dashboard role="Student" />} />
      <Route path="/organizer/dashboard" element={<Dashboard role="Organizer" />} />
      <Route path="/admin/dashboard" element={<Dashboard role="Admin" />} />
      <Route path="/student/events" element={<StudentEvents />} />
      <Route path="/organizer/events" element={<OrganizerEvents />} />
      <Route path="/admin/events/review" element={<AdminEventReview />} />
      <Route path="/organizer/events/:eventId/attendance" element={<OrganizerAttendance />} />
      <Route path="/admin/attendance" element={<AdminAttendance />} />
      <Route path="/admin/audit-log" element={<AdminAuditLog />} />
      <Route path="/student/feedback" element={<StudentFeedback />} />
      <Route path="/organizer/feedback" element={<OrganizerFeedback />} />
      <Route path="/admin/feedback" element={<AdminFeedback />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/events" element={<EventBrowser />} />
      <Route path="/events/:eventId" element={<EventDetails />} />
      <Route path="/registrations" element={<StudentRegistrations />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  );
}

export default App
