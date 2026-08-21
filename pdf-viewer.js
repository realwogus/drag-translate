import { GlobalWorkerOptions, TextLayer, getDocument } from './vendor/pdfjs/pdf.mjs';

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.mjs');

const viewer = document.querySelector('#viewer');
const progress = document.querySelector('#progress');
const documentTitle = document.querySelector('#documentTitle');
const pageCount = document.querySelector('#pageCount');
const originalLink = document.querySelector('#originalLink');
const errorBox = document.querySelector('#error');
const errorMessage = document.querySelector('#errorMessage');
const sourceUrl = new URLSearchParams(location.search).get('url');
const pages = new Map();
let pageObserver = null;

function getFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) || 'PDF 문서');
  } catch {
    return 'PDF 문서';
  }
}

function showError(message) {
  progress.classList.add('is-done');
  viewer.hidden = true;
  errorBox.hidden = false;
  errorMessage.textContent = message;
}

async function renderPage(pageNumber) {
  const entry = pages.get(pageNumber);
  if (!entry || entry.rendering || entry.rendered) return;
  entry.rendering = true;

  try {
    const { page, viewport, element } = entry;
    const outputScale = Math.min(window.devicePixelRatio || 1, 1.75);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    element.append(canvas);

    await page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    }).promise;

    const textLayerElement = document.createElement('div');
    textLayerElement.className = 'textLayer';
    textLayerElement.style.setProperty('--total-scale-factor', viewport.scale);
    element.append(textLayerElement);

    const textContent = await page.getTextContent();
    const textLayer = new TextLayer({
      textContentSource: textContent,
      container: textLayerElement,
      viewport
    });
    await textLayer.render();

    element.querySelector('.page-loading')?.remove();
    entry.rendered = true;
  } catch (error) {
    const loadingLabel = entry.element.querySelector('.page-loading');
    if (loadingLabel) loadingLabel.textContent = '이 페이지를 표시하지 못했습니다.';
    console.error(`PDF page ${pageNumber} render failed`, error);
  } finally {
    entry.rendering = false;
  }
}

async function loadPdf() {
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    showError('올바른 PDF 주소가 아닙니다.');
    return;
  }

  documentTitle.textContent = getFilename(sourceUrl);
  document.title = `${getFilename(sourceUrl)} · Drag Translate`;
  originalLink.href = sourceUrl;

  try {
    const base = chrome.runtime.getURL('vendor/pdfjs/');
    const loadingTask = getDocument({
      url: sourceUrl,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
      wasmUrl: `${base}wasm/`
    });
    loadingTask.onProgress = ({ loaded, total }) => {
      if (!total) return;
      progress.querySelector('span').style.width = `${Math.max(4, (loaded / total) * 100)}%`;
      progress.querySelector('span').style.animation = 'none';
    };

    const pdf = await loadingTask.promise;
    pageCount.textContent = `${pdf.numPages}페이지`;
    progress.classList.add('is-done');

    pageObserver = new IntersectionObserver((entries) => {
      for (const item of entries) {
        if (item.isIntersecting) renderPage(Number(item.target.dataset.pageNumber));
      }
    }, { rootMargin: '1000px 0px' });

    const desiredWidth = Math.min(960, Math.max(320, window.innerWidth - 40));
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const naturalViewport = page.getViewport({ scale: 1 });
      const scale = desiredWidth / naturalViewport.width;
      const viewport = page.getViewport({ scale });
      const element = document.createElement('section');
      element.className = 'pdf-page';
      element.dataset.pageNumber = String(pageNumber);
      element.setAttribute('aria-label', `${pageNumber}페이지`);
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      element.style.setProperty('--total-scale-factor', scale);
      element.innerHTML = `<span class="page-loading">${pageNumber}페이지 불러오는 중...</span>`;
      viewer.append(element);
      pages.set(pageNumber, { page, viewport, element, rendering: false, rendered: false });
      pageObserver.observe(element);
      if (pageNumber <= 2) renderPage(pageNumber);
    }
  } catch (error) {
    console.error('PDF load failed', error);
    showError('PDF 서버가 접근을 차단했거나 문서 형식을 읽을 수 없습니다.');
  }
}

loadPdf();
