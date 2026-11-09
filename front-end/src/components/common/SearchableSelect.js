import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import './SearchableSelect.css';

/**
 * Combobox: type in the field to filter; dropdown lists matches only (no nested search box).
 * `value` / option `value` are compared as strings; `onChange` receives the option's `value` as a string (or "").
 * Optional `onQueryChange` lets parents run server-side search while typing.
 * Set `clearable` (default: true when not required) to show an X and allow emptying the value.
 */
export default function SearchableSelect({
  id: idProp,
  value,
  onChange,
  options = [],
  placeholder = 'Type to search…',
  emptyLabel = 'Select…',
  disabled = false,
  className = '',
  required = false,
  clearable: clearableProp,
  allowCustomValue = false,
  onQueryChange,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) {
  const reactId = useId();
  const id = idProp || `searchable-select-${reactId}`;
  const listboxId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  /** After a pick, ignore the next focus so the list does not pop open again. */
  const suppressOpenOnFocusRef = useRef(false);
  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;

  const clearable = clearableProp !== undefined ? Boolean(clearableProp) : !required;
  const strValue = value === '' || value == null ? '' : String(value);
  const canClear = clearable && !disabled && strValue !== '';

  const selectedLabel = useMemo(() => {
    if (strValue === '') return '';
    const opt = options.find((o) => String(o.value) === strValue);
    if (opt?.label) return opt.label;
    if (allowCustomValue) return strValue;
    return '';
  }, [strValue, options, allowCustomValue]);

  // Keep showing the last known label if options briefly empty (e.g. server search).
  const displayLabelRef = useRef('');
  useEffect(() => {
    if (strValue === '') {
      displayLabelRef.current = '';
      return;
    }
    if (selectedLabel) {
      displayLabelRef.current = selectedLabel;
    }
  }, [strValue, selectedLabel]);

  const stableSelectedLabel = selectedLabel || (strValue ? displayLabelRef.current : '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const inputDisplay = open ? query : stableSelectedLabel;
  const inputPlaceholder = stableSelectedLabel && !open ? stableSelectedLabel : emptyLabel || placeholder;

  const closeMenu = (opts = {}) => {
    const { commitCustom = false } = opts;
    if (commitCustom && allowCustomValue) {
      const typed = query.trim();
      if (typed) onChange(typed);
    }
    setOpen(false);
    setQuery('');
    if (typeof onQueryChangeRef.current === 'function') {
      onQueryChangeRef.current('');
    }
  };

  const openMenu = (seedQuery = '') => {
    if (disabled) return;
    setQuery(seedQuery);
    setOpen(true);
    if (typeof onQueryChangeRef.current === 'function') {
      onQueryChangeRef.current(seedQuery);
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (seedQuery) inputRef.current?.select?.();
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        closeMenu({ commitCustom: true });
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeMenu uses latest query via closure when open
  }, [open, allowCustomValue, onChange, query]);

  const pick = (v) => {
    onChange(v === '' || v == null ? '' : String(v));
    setOpen(false);
    setQuery('');
    if (typeof onQueryChangeRef.current === 'function') {
      onQueryChangeRef.current('');
    }
    // Keep focus on the field for tabbing, but do not reopen the list.
    suppressOpenOnFocusRef.current = true;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      requestAnimationFrame(() => {
        suppressOpenOnFocusRef.current = false;
      });
    });
  };

  const customQuery = query.trim();

  const focusOption = (position) => {
    const optionButtons = Array.from(
      rootRef.current?.querySelectorAll('.searchable-select__option') || []
    );
    if (!optionButtons.length) return;
    const nextIndex =
      position === 'last'
        ? optionButtons.length - 1
        : Math.max(0, Math.min(Number(position) || 0, optionButtons.length - 1));
    optionButtons[nextIndex]?.focus();
  };

  const handleOptionKeyDown = (event) => {
    const optionButtons = Array.from(
      rootRef.current?.querySelectorAll('.searchable-select__option') || []
    );
    const currentIndex = optionButtons.indexOf(event.currentTarget);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (currentIndex + direction + optionButtons.length) % optionButtons.length;
      optionButtons[nextIndex]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusOption(event.key === 'Home' ? 0 : 'last');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleInputChange = (e) => {
    const next = e.target.value;
    setQuery(next);
    if (!open) setOpen(true);
    if (typeof onQueryChangeRef.current === 'function') {
      onQueryChangeRef.current(next);
    }
  };

  const handleInputFocus = () => {
    if (disabled || suppressOpenOnFocusRef.current) return;
    // Already chosen: keep the list closed until click, type, or chevron.
    if (strValue !== '') return;
    if (!open) openMenu('');
  };

  const handleInputClick = () => {
    if (disabled || open || suppressOpenOnFocusRef.current) return;
    // Clicking a filled field opens the list to pick another — start with an empty
    // query so server-side search is not run against the display label.
    if (strValue !== '') openMenu('');
  };

  const handleInputKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openMenu(strValue !== '' ? '' : query || selectedLabel || '');
      else focusOption(0);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openMenu(strValue !== '' ? '' : query || selectedLabel || '');
      else focusOption('last');
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key === 'Enter') {
      if (allowCustomValue && customQuery) {
        e.preventDefault();
        pick(customQuery);
        return;
      }
      if (open && filtered.length === 1) {
        e.preventDefault();
        pick(String(filtered[0].value));
      }
      return;
    }

    // Typing / backspace on a closed selected field: clear or start a fresh filter.
    if (!open && strValue !== '') {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (canClear) {
          pick('');
        } else {
          openMenu('');
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openMenu(e.key);
      }
    }
  };

  return (
    <div className={`searchable-select ${className}`.trim()} ref={rootRef}>
      {required && (
        <select
          className="searchable-select__native-required"
          aria-hidden="true"
          tabIndex={-1}
          value={strValue}
          required
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{emptyLabel}</option>
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      <div className={`searchable-select__field${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="searchable-select__input"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          aria-labelledby={ariaLabelledBy}
          aria-label={ariaLabel || undefined}
          aria-required={required || undefined}
          disabled={disabled}
          placeholder={inputPlaceholder}
          value={inputDisplay}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          onKeyDown={handleInputKeyDown}
          autoComplete="off"
        />
        {canClear ? (
          <button
            type="button"
            className="searchable-select__clear"
            tabIndex={-1}
            aria-label="Clear selection"
            title="Clear selection"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              pick('');
            }}
          >
            ×
          </button>
        ) : null}
        <button
          type="button"
          className="searchable-select__toggle"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Close options' : 'Open options'}
          onMouseDown={(e) => {
            // Keep focus on the input; only toggle the list.
            e.preventDefault();
          }}
          onClick={() => {
            if (disabled) return;
            if (open) closeMenu();
            else openMenu(strValue !== '' ? '' : selectedLabel || '');
          }}
        >
          <span className="searchable-select__chevron" aria-hidden />
        </button>
      </div>

      {open && (
        <div className="searchable-select__dropdown">
          <ul
            className="searchable-select__list"
            id={listboxId}
            role="listbox"
            aria-labelledby={ariaLabelledBy || id}
          >
            {canClear && (
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  tabIndex={-1}
                  className="searchable-select__option searchable-select__option--clear"
                  onClick={() => pick('')}
                  onKeyDown={handleOptionKeyDown}
                >
                  Clear selection
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="searchable-select__empty" role="status" aria-live="polite">
                {allowCustomValue ? 'No matches — you can use what you typed' : 'No matches'}
              </li>
            ) : (
              filtered.map((o) => {
                const active = String(o.value) === strValue;
                return (
                  <li key={String(o.value)} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      className={`searchable-select__option${active ? ' searchable-select__option--active' : ''}`}
                      onClick={() => pick(String(o.value))}
                      onKeyDown={handleOptionKeyDown}
                    >
                      {o.label}
                    </button>
                  </li>
                );
              })
            )}
            {allowCustomValue &&
              customQuery &&
              !options.some(
                (o) =>
                  o.label.toLowerCase() === customQuery.toLowerCase() ||
                  String(o.value).toLowerCase() === customQuery.toLowerCase()
              ) && (
                <li role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    tabIndex={-1}
                    className="searchable-select__option"
                    onClick={() => pick(customQuery)}
                    onKeyDown={handleOptionKeyDown}
                  >
                    Use &quot;{customQuery}&quot;
                  </button>
                </li>
              )}
          </ul>
        </div>
      )}
    </div>
  );
}
