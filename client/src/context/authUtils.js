const roleNames = {
  student: 'Student',
  organizer: 'Organizer',
  admin: 'Admin',
}
function extractUser(response) {
  return response?.data?.data?.user
    || response?.data?.user
    || response?.user
    || (response?.data && typeof response.data === 'object' && ('email' in response.data || 'role' in response.data) ? response.data : null)
    || (response && typeof response === 'object' && ('email' in response || 'role' in response) ? response : null)
}
export function normalizeAuthUser(response, fallbackRole) {
  const authenticatedUser = extractUser(response)
  if (!authenticatedUser || typeof authenticatedUser !== 'object') return null
  const rawRole = authenticatedUser.role || fallbackRole
  const role = typeof rawRole === 'string' ? roleNames[rawRole.trim().toLowerCase()] : undefined
  if (!role) return null
  return {
    ...authenticatedUser,
    id: authenticatedUser.id || authenticatedUser._id,
    role,
  }
}
export function getDashboardPath(authenticatedUser) {
  if (!authenticatedUser?.role) return null
  return {
    Student: '/student/dashboard',
    Organizer: '/organizer/dashboard',
    Admin: '/admin/dashboard',
  }[authenticatedUser.role] || null
}
