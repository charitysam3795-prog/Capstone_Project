import React, { useState, useEffect, useCallback } from 'react';
import './PortalSidebar.css';

/**
 * Collapsible sidebar with grouped nav (hospital-style).
 * @param {object} props
 * @param {'admin'|'dean'|'faculty'|'program-head'|'secretary'} props.variant
 * @param {string} props.storageKey localStorage key for collapsed state
 * @param {string} props.brandTitle short title when expanded
 * @param {{ id: string, title: string, items: { id: string, label: string, icon?: string, children?: { id: string, label: string }[] }[] }[]} props.groups
 * @param {string} props.activeId
 * @param {(id: string) => void} props.onSelect
 * @param {React.ReactNode} [props.footer]
 */
const PortalSidebar = ({
  variant = 'admin',
  storageKey,
  brandTitle,
  groups,
  activeId,
  onSelect,
  footer,
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    if (!storageKey) return false;
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries((groups || []).map((g) => [g.id, true]))
  );

  /** Nested nav under one item (e.g. Lookup data → Programs). */
  const [openNestedItems, setOpenNestedItems] = useState({});

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      (groups || []).forEach((g) => {
        if (next[g.id] === undefined) next[g.id] = true;
      });
      return next;
    });
  }, [groups]);

  useEffect(() => {
    (groups || []).forEach((section) => {
      section.items.forEach((item) => {
        if (item.children?.some((c) => c.id === activeId)) {
          setOpenNestedItems((prev) => ({ ...prev, [item.id]: true }));
        }
      });
    });
  }, [activeId, groups]);

  useEffect(() => {
    if (!activeId || typeof document === 'undefined') return;
    const el = document.querySelector(`[data-tour="nav-${activeId}"]`);
    const nav = el?.closest?.('.portal-sidebar__nav');
    if (!el || !nav || typeof el.scrollIntoView !== 'function') return;
    const elRect = el.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    if (elRect.top < navRect.top || elRect.bottom > navRect.bottom) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeId]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? 'true' : 'false');
        } catch {
          //
        }
      }
      return next;
    });
  }, [storageKey]);

  // Guide / other tools can force-expand without toggle races.
  useEffect(() => {
    const expand = () => {
      setCollapsed(false);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, 'false');
        } catch {
          //
        }
      }
    };
    window.addEventListener('portal-sidebar-expand', expand);
    return () => window.removeEventListener('portal-sidebar-expand', expand);
  }, [storageKey]);

  const toggleSection = (id) => {
    setOpenSections((s) => ({ ...s, [id]: !s[id] }));
  };

  const handleSelect = (id) => {
    onSelect(id);
    setMobileOpen(false);
  };

  /* Mobile drawer always shows full labels even if desktop rail is collapsed */
  const railExpanded = !collapsed || mobileOpen;

  return (
    <>
      <button
        type="button"
        className={`portal-sidebar__mobile-toggle portal-sidebar__mobile-toggle--${variant}`}
        aria-label="Open menu"
        onClick={() => setMobileOpen(true)}
      >
        <i className="fa-solid fa-bars" aria-hidden />
      </button>
      {mobileOpen && (
        <button
          type="button"
          className="portal-sidebar__backdrop"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        data-tour="portal-sidebar"
        className={[
          'portal-sidebar',
          `portal-sidebar--${variant}`,
          collapsed && !mobileOpen ? 'portal-sidebar--collapsed' : '',
          mobileOpen ? 'portal-sidebar--mobile-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="portal-sidebar__top">
          <div className="portal-sidebar__brand" title={brandTitle}>
            {railExpanded && <span className="portal-sidebar__brand-text">{brandTitle}</span>}
            {!railExpanded && <i className="fa-solid fa-layer-group portal-sidebar__brand-icon" aria-hidden />}
          </div>
          <button
            type="button"
            className="portal-sidebar__collapse-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <i className={`fa-solid ${collapsed ? 'fa-angles-right' : 'fa-angles-left'}`} aria-hidden />
          </button>
        </div>

        <nav className="portal-sidebar__nav" aria-label="Module navigation">
          {(groups || []).map((section) => (
            <div key={section.id} className="portal-sidebar__section">
              <button
                type="button"
                className="portal-sidebar__section-header"
                onClick={() => railExpanded && toggleSection(section.id)}
                aria-expanded={openSections[section.id] !== false}
                aria-label={section.title}
              >
                {railExpanded && (
                  <>
                    <span className="portal-sidebar__section-title">{section.title}</span>
                    <i
                      className={`fa-solid fa-chevron-down portal-sidebar__chevron ${
                        openSections[section.id] === false ? 'portal-sidebar__chevron--closed' : ''
                      }`}
                      aria-hidden
                    />
                  </>
                )}
                {!railExpanded && <span className="portal-sidebar__section-dot" title={section.title} />}
              </button>
              {(!railExpanded || openSections[section.id] !== false) && (
                <ul className="portal-sidebar__list">
                  {section.items.map((item) => {
                    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
                    const childActive = hasChildren && item.children.some((c) => c.id === activeId);
                    // Default closed so long Lookup Data lists don't flood the rail;
                    // auto-open only when a child is the active page (or user expands).
                    const nestedOpen =
                      hasChildren &&
                      (openNestedItems[item.id] === true ||
                        (openNestedItems[item.id] === undefined && childActive));

                    if (!hasChildren) {
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            data-tour={`nav-${item.id}`}
                            className={
                              activeId === item.id
                                ? 'portal-sidebar__link portal-sidebar__link--active'
                                : 'portal-sidebar__link'
                            }
                            onClick={() => handleSelect(item.id)}
                            aria-current={activeId === item.id ? 'page' : undefined}
                            title={!railExpanded ? item.label : undefined}
                          >
                            {item.icon && (
                              <i className={`${item.icon} portal-sidebar__icon`} aria-hidden />
                            )}
                            <span className="portal-sidebar__label">{item.label}</span>
                          </button>
                        </li>
                      );
                    }

                    if (!railExpanded) {
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            data-tour={`nav-${item.id}`}
                            className={
                              childActive
                                ? 'portal-sidebar__link portal-sidebar__link--active'
                                : 'portal-sidebar__link'
                            }
                            onClick={() =>
                              handleSelect(
                                item.children.find((c) => c.id === activeId)?.id || item.children[0].id
                              )
                            }
                            aria-current={activeId === item.id ? 'page' : undefined}
                            title={item.label}
                          >
                            {item.icon && (
                              <i className={`${item.icon} portal-sidebar__icon`} aria-hidden />
                            )}
                            <span className="portal-sidebar__label">{item.label}</span>
                          </button>
                        </li>
                      );
                    }

                    return (
                      <li key={item.id} className="portal-sidebar__item--nested">
                        <div className="portal-sidebar__nested-head">
                          <button
                            type="button"
                            data-tour={`nav-${item.id}`}
                            className={
                              childActive
                                ? 'portal-sidebar__link portal-sidebar__link--parent portal-sidebar__link--active-parent'
                                : 'portal-sidebar__link portal-sidebar__link--parent'
                            }
                            onClick={() =>
                              setOpenNestedItems((prev) => {
                                const isOpen =
                                  prev[item.id] === true ||
                                  (prev[item.id] === undefined && childActive);
                                return { ...prev, [item.id]: !isOpen };
                              })
                            }
                            aria-expanded={nestedOpen}
                          >
                            {item.icon && (
                              <i className={`${item.icon} portal-sidebar__icon`} aria-hidden />
                            )}
                            <span className="portal-sidebar__label">{item.label}</span>
                            <i
                              className={`fa-solid fa-chevron-down portal-sidebar__nested-chevron ${
                                nestedOpen ? '' : 'portal-sidebar__nested-chevron--closed'
                              }`}
                              aria-hidden
                            />
                          </button>
                        </div>
                        {nestedOpen && (
                          <ul className="portal-sidebar__sublist">
                            {item.children.map((child) => (
                              <li key={child.id}>
                                <button
                                  type="button"
                                  data-tour={`nav-${child.id}`}
                                  className={
                                    activeId === child.id
                                      ? 'portal-sidebar__sublink portal-sidebar__sublink--active'
                                      : 'portal-sidebar__sublink'
                                  }
                                  onClick={() => handleSelect(child.id)}
                                  aria-current={activeId === child.id ? 'page' : undefined}
                                >
                                  {child.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </nav>

        {footer && <div className="portal-sidebar__footer">{footer}</div>}

        <button
          type="button"
          className="portal-sidebar__mobile-close"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </aside>
    </>
  );
};

export default PortalSidebar;
