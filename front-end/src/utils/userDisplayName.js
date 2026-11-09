/**
 * Prefer API display_name; fall back to profile fields or email local-part.
 */
export function userDisplayName(user) {
  if (!user) return '';
  const fromApi = String(user.display_name || user.displayName || '').trim();
  if (fromApi) return fromApi;

  const profiles = [
    user.dean_profile || user.deanProfile,
    user.program_head_profile || user.programHeadProfile,
    user.secretary_profile || user.secretaryProfile,
    user.faculty_profile || user.facultyProfile,
    user.student_profile || user.studentProfile,
  ];
  for (const p of profiles) {
    if (!p) continue;
    const name = [p.first_name, p.middle_name, p.last_name]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .join(' ');
    if (name) return name;
  }

  const email = String(user.email || '').trim();
  if (!email) return 'User';
  const local = email.split('@')[0] || email;
  return local;
}
