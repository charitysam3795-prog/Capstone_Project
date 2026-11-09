import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { userDisplayName } from '../../utils/userDisplayName';

/**
 * Shared portal sidebar footer: avatar + "Logged in" + display name + Logout.
 */
export default function PortalSidebarUserFooter({ onLogout }) {
  const { user } = useAuth();
  if (!user) return null;

  const name = userDisplayName(user);
  const avatarUrl = user.avatar_url || user.avatarUrl || null;
  const initial = (name || user.email || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="portal-sidebar__footer-inner">
      <div className="portal-sidebar__footer-user">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="portal-sidebar__footer-avatar"
          />
        ) : (
          <span className="portal-sidebar__footer-avatar portal-sidebar__footer-avatar--fallback" aria-hidden>
            {initial}
          </span>
        )}
        <div className="portal-sidebar__footer-text">
          <span className="portal-sidebar__footer-muted">Logged in</span>
          <div className="portal-sidebar__footer-email" title={user.email}>
            {name}
          </div>
        </div>
      </div>
      {typeof onLogout === 'function' ? (
        <button
          type="button"
          className="portal-sidebar__logout"
          onClick={onLogout}
          title="Logout"
          aria-label="Logout"
        >
          <span className="portal-sidebar__logout-label">Logout</span>
        </button>
      ) : null}
    </div>
  );
}
