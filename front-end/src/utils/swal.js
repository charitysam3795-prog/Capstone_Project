import Swal from 'sweetalert2';

/** Above app modals (standing ~1100, promote ~1200); below session expiry (~100000). */
const SWAL_Z_INDEX = 20000;

function withSwalLayer(options) {
  return {
    // Avoid body height:auto — it collapses sticky/portal shells and yanks the sidebar up.
    heightAuto: false,
    scrollbarPadding: true,
    ...options,
    didOpen: (el) => {
      const container = Swal.getContainer();
      if (container) container.style.zIndex = String(SWAL_Z_INDEX);
      if (typeof options.didOpen === 'function') options.didOpen(el);
    },
  };
}

/**
 * Confirmation dialog. Returns true if user confirmed.
 *
 * @param {object|string} [first] — Options object, or title string when using positional args.
 * @param {string} [text] — Body text (positional mode only).
 * @param {string} [confirmButtonText] — Confirm label (positional mode only).
 * @param {string} [cancelButtonText] — Cancel label (positional mode only).
 */
export async function swalConfirm(first, text, confirmButtonText, cancelButtonText) {
  let opts;
  if (
    first !== null &&
    first !== undefined &&
    typeof first === 'object' &&
    !Array.isArray(first)
  ) {
    opts = first;
  } else {
    opts = {
      title: typeof first === 'string' && first ? first : 'Are you sure?',
      text: text ?? '',
      confirmButtonText: confirmButtonText ?? 'Yes',
      cancelButtonText: cancelButtonText ?? 'Cancel',
    };
  }

  const {
    title = 'Are you sure?',
    text: body = '',
    html,
    icon = 'warning',
    confirmButtonText: okText = 'Yes',
    cancelButtonText: cancelText = 'Cancel',
    didOpen,
  } = opts;

  const result = await Swal.fire(
    withSwalLayer({
      title,
      ...(html ? { html } : { text: body || undefined }),
      icon,
      showCancelButton: true,
      confirmButtonText: okText,
      cancelButtonText: cancelText,
      reverseButtons: true,
      focusCancel: true,
      didOpen,
    })
  );
  return result.isConfirmed;
}

export function swalSuccess(title, text) {
  return Swal.fire(
    withSwalLayer({
      icon: 'success',
      title: title || 'Success',
      text: text || undefined,
      confirmButtonText: 'OK',
    })
  );
}

export function swalError(title, text) {
  return Swal.fire(
    withSwalLayer({
      icon: 'error',
      title: title || 'Error',
      text: text || 'Something went wrong.',
      confirmButtonText: 'OK',
    })
  );
}

export function swalInfo(title, text) {
  return Swal.fire(
    withSwalLayer({
      icon: 'info',
      title: title || '',
      text: text || undefined,
      confirmButtonText: 'OK',
    })
  );
}

/** Top-end toast; use for non-blocking success messages */
export function swalToast(icon, title) {
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3200,
    timerProgressBar: true,
    didOpen: () => {
      const container = Swal.getContainer();
      if (container) container.style.zIndex = String(SWAL_Z_INDEX);
    },
  });
  return Toast.fire({ icon, title });
}
