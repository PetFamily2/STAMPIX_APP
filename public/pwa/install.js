/* Shared installation UI for the public entry and application; no account data. */
(() => {
  if (!isSecureContext || location.protocol !== 'https:') return;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const dismissKey = 'stampaix:install-banner-dismissed-until';
  let promptEvent = null;
  let installed = navigator.standalone === true || standalone.matches;
  let banner = null;
  let installing = false;
  const hidden = () => {
    try {
      return Number(localStorage.getItem(dismissKey)) > Date.now();
    } catch {
      return false;
    }
  };
  const remove = () => {
    banner?.remove();
    banner = null;
  };
  const render = () => {
    if (installed || hidden() || banner || !document.body) return;
    banner = document.createElement('aside');
    banner.id = 'stampaix-install-banner';
    banner.dir = 'rtl';
    banner.setAttribute('aria-label', 'הוספת StampAix למסך הבית');
    banner.style.cssText =
      'position:fixed;top:max(12px,env(safe-area-inset-top));left:12px;right:12px;max-width:460px;margin:0 auto;z-index:10000;background:#fff;color:#172033;border:1px solid #cbd5e1;border-radius:18px;padding:16px;box-shadow:0 8px 32px #17203333;font:15px Heebo,Arial,sans-serif;text-align:right;box-sizing:border-box';
    const title = document.createElement('strong');
    title.textContent = 'StampAix במסך הבית';
    title.style.cssText = 'display:block;font-size:18px;padding-left:44px';
    const description = document.createElement('p');
    description.textContent =
      'הוסיפו למסך הבית לגישה מהירה לכרטיסיות ולעסק שלכם.';
    description.style.cssText = 'margin:8px 0 12px;line-height:1.5';
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap';
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = 'הוספה למסך הבית';
    add.style.cssText =
      'border:0;border-radius:12px;background:#2459c5;color:#fff;padding:10px 16px;min-height:44px;font:inherit;cursor:pointer';
    const later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'אחר כך';
    later.setAttribute('aria-label', 'סגירת הצעת ההתקנה');
    later.style.cssText =
      'border:1px solid #64748b;border-radius:12px;background:#fff;color:#172033;padding:10px 16px;min-height:44px;font:inherit;cursor:pointer';
    const instructions = document.createElement('p');
    instructions.hidden = true;
    instructions.setAttribute('role', 'status');
    instructions.style.cssText = 'margin:12px 0 0;line-height:1.6';
    add.addEventListener('click', async () => {
      if (installing) return;
      if (!promptEvent) {
        const ios =
          /iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        instructions.textContent = ios
          ? 'ב־iPhone או iPad: פתחו ב־Safari, לחצו על שיתוף ובחרו ״הוסף למסך הבית״.'
          : 'פתחו את תפריט הדפדפן ובחרו ״התקנת StampAix״ או ״הוספה למסך הבית״. אם האפשרות עדיין לא מופיעה, היכנסו לאפליקציה ונסו שוב.';
        instructions.hidden = false;
        return;
      }
      const event = promptEvent;
      promptEvent = null;
      installing = true;
      add.disabled = true;
      try {
        // Browser consent is opened only by this explicit click, once per event.
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === 'accepted') {
          installed = true;
          remove();
        }
      } catch {
        instructions.textContent =
          'לא ניתן לפתוח את ההתקנה כרגע. אפשר להוסיף דרך תפריט הדפדפן.';
        instructions.hidden = false;
      } finally {
        installing = false;
        add.disabled = false;
      }
    });
    later.addEventListener('click', () => {
      try {
        localStorage.setItem(dismissKey, String(Date.now() + 7 * 86400000));
      } catch {
        /* Dismiss still works when preference storage is unavailable. */
      }
      remove();
    });
    controls.append(add, later);
    banner.append(title, description, controls, instructions);
    document.body.append(banner);
  };
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    promptEvent = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    promptEvent = null;
    remove();
  });
  standalone.addEventListener('change', () => {
    installed = navigator.standalone === true || standalone.matches;
    if (installed) remove();
    else render();
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', render, { once: true });
  else render();
})();
