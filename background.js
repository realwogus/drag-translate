const PDF_URL_PATTERN = /\/pdf(?:\/|\?|$)|\.pdf(?:\?|#|$)/i;

function isWebPage(url = '') {
  return /^https?:/i.test(url);
}

function isExternalPdf(url = '') {
  return isWebPage(url) && PDF_URL_PATTERN.test(url);
}

async function updateIcon(enabled) {
  await chrome.action.setIcon({
    path: {
      16: `icons/${enabled ? 'active' : 'inactive'}16.png`,
      32: `icons/${enabled ? 'active' : 'inactive'}32.png`
    }
  });
}

async function configureTabAction(tab, enabled) {
  if (!tab?.id) return;
  const pdf = isExternalPdf(tab.url);
  await Promise.all([
    chrome.action.setPopup({ tabId: tab.id, popup: pdf ? 'popup.html' : '' }),
    chrome.action.setTitle({
      tabId: tab.id,
      title: pdf
        ? '번역 가능한 PDF 뷰어로 열기'
        : `Drag Translate: ${enabled ? '켜짐' : '꺼짐'}`
    })
  ]).catch(() => {});
}

async function configureAllTabActions(enabled) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map((tab) => configureTabAction(tab, enabled)));
}

async function applyToTab(tab, enabled) {
  if (!tab?.id || !isWebPage(tab.url) || isExternalPdf(tab.url)) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SET_ENABLED', enabled, silent: true });
  } catch {
    if (!enabled) return false;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'SET_ENABLED', enabled, silent: true });
  }
  return true;
}

async function applyToAllTabs(enabled) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map((tab) => applyToTab(tab, enabled)));
}

async function setGlobalEnabled(enabled) {
  await chrome.storage.local.set({ enabled });
  await Promise.all([
    updateIcon(enabled),
    configureAllTabActions(enabled),
    applyToAllTabs(enabled)
  ]);
}

async function initializeAction() {
  const { enabled = false } = await chrome.storage.local.get('enabled');
  await Promise.all([updateIcon(enabled), configureAllTabActions(enabled)]);
}

chrome.action.onClicked.addListener(async () => {
  const { enabled = false } = await chrome.storage.local.get('enabled');
  await setGlobalEnabled(!enabled);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const [tab, { enabled = false }] = await Promise.all([
    chrome.tabs.get(tabId).catch(() => null),
    chrome.storage.local.get('enabled')
  ]);
  await configureTabAction(tab, enabled);
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'loading') return;
  const { enabled = false } = await chrome.storage.local.get('enabled');
  await configureTabAction(tab, enabled);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SET_GLOBAL_ENABLED') {
    setGlobalEnabled(Boolean(message.enabled))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type !== 'TRANSLATE' || typeof message.text !== 'string') return;
  const text = message.text.trim();
  if (!text || text.length > 1500) {
    sendResponse({ ok: false, error: '잘못된 번역 요청입니다.' });
    return;
  }

  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: 'ko',
    dt: 't',
    q: text
  });

  fetch(`https://translate.googleapis.com/translate_a/single?${params}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Translation request failed: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const translated = data?.[0]?.map((part) => part?.[0] ?? '').join('').trim();
      if (!translated) throw new Error('Empty translation');
      sendResponse({ ok: true, translated });
    })
    .catch(() => sendResponse({ ok: false, error: '번역 요청에 실패했습니다.' }));

  return true;
});

initializeAction();
