const roleNames = {
  student: 'Student',
  organizer: 'Organizer',
  admin: 'Admin',
}

export function normalizeAuthUser(response, fallbackRole) {
  if (!response) return null

  // Extract user object across all possible Axios / Express response layers
  const authenticatedUser =
    response?.data?.data?.user ||
    response?.data?.user ||
    response?.user ||
    (response?.data && typeof response.data === 'object' && ('email' in response.data || 'role' in response.data) ? response.data : null) ||
    (typeof response === 'object' && ('email' in response || 'role' in response) ? response : null)

  if (!authenticatedUser || typeof authenticatedUser !== 'object') {
    return null
  }

  // Extract raw role string from user object, response object, or fallback
  const rawRole =
    authenticatedUser.role ||
    response?.data?.data?.user?.role ||
    response?.data?.user?.role ||
    response?.data?.role ||
    response?.role ||
    fallbackRole

  const normalizedKey = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : ''
  const role = roleNames[normalizedKey] || 'Student' // Fallback safely to Student if valid user object exists

  return {
    ...authenticatedUser,
    id: authenticatedUser.id || authenticatedUser._id,
    role,
  }
}

export function getDashboardPath(authenticatedUser) {
  const paths = {
    Student: '/student/dashboard',
    Organizer: '/organizer/dashboard',
    Admin: '/admin/dashboard',
  }

  if (!authenticatedUser || !authenticatedUser.role) {
    return '/student/dashboard'
  }

  return paths[authenticatedUser.role] || '/student/dashboard'
}