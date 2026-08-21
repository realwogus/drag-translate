(() => {
  if (globalThis.__dragTranslateLoaded) return;
  globalThis.__dragTranslateLoaded = true;

  let enabled = false;
  let card = null;
  let lastText = '';
  let requestSequence = 0;

  const isEditable = (element) => Boolean(
    element?.closest?.('input, textarea, [contenteditable="true"], [role="textbox"]')
  );

  function removeCard() {
    card?.remove();
    card = null;
    lastText = '';
  }

  function showEnabledToast() {
    document.querySelector('#drag-translate-enabled-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'drag-translate-enabled-toast';
    toast.textContent = '✓  Drag Translate 켜짐';
    toast.style.cssText = `
      all: initial; position: fixed; z-index: 2147483647; top: 18px; right: 18px;
      padding: 11px 15px; border-radius: 10px; color: #fff; background: #1769e0;
      box-shadow: 0 8px 24px rgba(20, 35, 64, .24);
      font: 700 13px/1.3 Inter, Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;
    document.documentElement.append(toast);
    window.setTimeout(() => toast.remove(), 1600);
  }

  function createCard(rect, sourceText) {
    removeCard();

    card = document.createElement('div');
    card.id = 'drag-translate-card';
    card.setAttribute('role', 'status');
    card.innerHTML = `
      <div class="dt-header">
        <span class="dt-logo">가A</span>
        <span>Google 번역</span>
        <button class="dt-close" type="button" aria-label="번역 닫기">×</button>
      </div>
      <div class="dt-source"></div>
      <div class="dt-divider"></div>
      <div class="dt-result"><span class="dt-spinner"></span> 번역 중...</div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #drag-translate-card {
        all: initial; position: fixed; z-index: 2147483647; width: min(340px, calc(100vw - 24px));
        overflow: hidden; border: 1px solid rgba(33, 48, 76, .12); border-radius: 14px;
        color: #172033; background: #fff; box-shadow: 0 14px 38px rgba(20, 35, 64, .2);
        font-family: Inter, Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        animation: dt-in .14s ease-out;
      }
      #drag-translate-card * { box-sizing: border-box; }
      #drag-translate-card .dt-header { display: flex; align-items: center; gap: 8px; padding: 11px 13px; color: #526079; background: #f7f9fc; font-size: 12px; font-weight: 700; }
      #drag-translate-card .dt-logo { color: #1769e0; font-size: 12px; font-weight: 900; }
      #drag-translate-card .dt-close { all: unset; margin-left: auto; padding: 0 3px; color: #7e899b; cursor: pointer; font-size: 20px; line-height: 1; }
      #drag-translate-card .dt-source { display: -webkit-box; overflow: hidden; padding: 13px 15px 5px; color: #7b8494; font-size: 12px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
      #drag-translate-card .dt-divider { height: 1px; margin: 7px 15px 0; background: #edf0f5; }
      #drag-translate-card .dt-result { padding: 13px 15px 16px; color: #172033; font-size: 15px; font-weight: 600; line-height: 1.55; white-space: pre-wrap; }
      #drag-translate-card .dt-result.dt-error { color: #c13d42; font-size: 13px; font-weight: 500; }
      #drag-translate-card .dt-spinner { display: inline-block; width: 12px; height: 12px; margin-right: 5px; border: 2px solid #dbe6f7; border-top-color: #1769e0; border-radius: 50%; vertical-align: -1px; animation: dt-spin .7s linear infinite; }
      @keyframes dt-in { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
      @keyframes dt-spin { to { transform: rotate(360deg); } }
    `;
    card.prepend(style);
    card.querySelector('.dt-source').textContent = sourceText;
    card.querySelector('.dt-close').addEventListener('click', (event) => {
      event.stopPropagation();
      removeCard();
    });
    document.documentElement.append(card);

    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    const gap = 10;
    const left = Math.min(
      Math.max(12, rect.left + (rect.width / 2) - (cardWidth / 2)),
      window.innerWidth - cardWidth - 12
    );
    const below = rect.bottom + gap;
    const top = below + cardHeight <= window.innerHeight - 12
      ? below
      : Math.max(12, rect.top - cardHeight - gap);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  async function translate(text, rect) {
    const sequence = ++requestSequence;
    createCard(rect, text);
    lastText = text;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'TRANSLATE', text });
      if (!response?.ok || !response.translated) throw new Error(response?.error || 'Translation failed');
      if (sequence !== requestSequence || !card) return;
      card.querySelector('.dt-result').textContent = response.translated;
    } catch (error) {
      if (sequence !== requestSequence || !card) return;
      const result = card.querySelector('.dt-result');
      result.classList.add('dt-error');
      result.textContent = '번역하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }
  }

  function handleSelection(event) {
    if (!enabled || isEditable(event.target) || card?.contains(event.target)) return;

    window.setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().replace(/\s+/g, ' ').trim();
      if (!text || text === lastText || text.length > 1500 || !/[A-Za-z]/.test(text)) return;

      const range = selection.rangeCount ? selection.getRangeAt(0) : null;
      if (!range || range.collapsed) return;
      translate(text, range.getBoundingClientRect());
    }, 0);
  }

  document.addEventListener('mouseup', handleSelection, true);
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') removeCard();
    if (event.key === 'Shift' || event.key.startsWith('Arrow')) handleSelection(event);
  }, true);
  document.addEventListener('pointerdown', (event) => {
    if (card && !card.contains(event.target)) removeCard();
  }, true);
  window.addEventListener('scroll', removeCard, true);
  window.addEventListener('resize', removeCard);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'SET_ENABLED') return;
    enabled = Boolean(message.enabled);
    if (enabled && !message.silent) showEnabledToast();
    else removeCard();
    sendResponse({ ok: true });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.enabled) return;
    enabled = Boolean(changes.enabled.newValue);
    if (!enabled) removeCard();
  });

  chrome.storage.local.get('enabled').then((value) => {
    enabled = Boolean(value.enabled);
  });
})();
