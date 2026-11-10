/* Public entry notice: presentation acknowledgment only, no device or marketing consent. */
(() => {
  const notice = document.querySelector('[data-privacy-notice]');
  if (!notice) return;
  const version = notice.getAttribute('data-privacy-version');
  const key = 'stampaix:privacy-notice-version';
  let accepted = false;
  try {
    accepted = localStorage.getItem(key) === version;
  } catch {
    /* Show when storage is blocked. */
  }
  notice.hidden = accepted;
  notice
    .querySelector('[data-privacy-accept]')
    .addEventListener('click', () => {
      try {
        localStorage.setItem(key, version);
      } catch {
        /* Still dismiss for this visit. */
      }
      notice.hidden = true;
      window.dispatchEvent(new Event('stampaix:privacy-acknowledged'));
    });
})();
