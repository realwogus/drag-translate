const statusText = document.querySelector('#statusText');
const openPdfViewerButton = document.querySelector('#openPdfViewer');

let currentTab = null;
let pdfSourceUrl = null;

function isPdfUrl(url = '') {
  return /\/pdf(?:\/|\?|$)|\.pdf(?:\?|#|$)/i.test(url);
}

async function initialize() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = currentTab?.url ?? '';
  pdfSourceUrl = /^https?:/i.test(url) && isPdfUrl(url) ? url : null;

  if (!pdfSourceUrl) {
    statusText.classList.add('is-error');
    statusText.textContent = '현재 페이지에서 PDF 주소를 확인할 수 없습니다.';
    openPdfViewerButton.hidden = true;
  }
}

openPdfViewerButton.addEventListener('click', async () => {
  if (!currentTab?.id || !pdfSourceUrl) return;
  openPdfViewerButton.disabled = true;

  const result = await chrome.runtime.sendMessage({ type: 'SET_GLOBAL_ENABLED', enabled: true });
  if (!result?.ok) {
    statusText.classList.add('is-error');
    statusText.textContent = '번역 기능을 활성화하지 못했습니다.';
    openPdfViewerButton.disabled = false;
    return;
  }

  const viewerUrl = new URL(chrome.runtime.getURL('pdf-viewer.html'));
  viewerUrl.searchParams.set('url', pdfSourceUrl);
  await chrome.tabs.update(currentTab.id, { url: viewerUrl.href });
  window.close();
});

initialize();
