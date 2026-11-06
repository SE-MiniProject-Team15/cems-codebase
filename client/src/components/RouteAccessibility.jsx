import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const titles = {
  '/login': 'Log in',
  '/register': 'Create an account',
  '/events': 'Browse events',
  '/student/events': 'Student events',
  '/organizer/events': 'Manage events',
  '/notifications': 'Notifications',
  '/student/dashboard': 'Student dashboard',
  '/organizer/dashboard': 'Organizer dashboard',
  '/admin/dashboard': 'Administrator dashboard',
}

export default function RouteAccessibility() {
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)

  useEffect(() => {
    document.title = `${titles[pathname] || 'Event details'} | CEMS`
    if (previousPath.current !== pathname) {
      document.getElementById('main-content')?.focus()
      window.scrollTo(0, 0)
    }
    previousPath.current = pathname
  }, [pathname])

  return <a className="skip-link" href="#main-content">Skip to main content</a>
}
