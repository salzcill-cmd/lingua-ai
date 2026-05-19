/**
 * LinguaAI — Intelligent Translation Platform
 * Production-grade vanilla JavaScript
 *
 * Architecture: Modular IIFE pattern with clear separation of concerns
 * Features: Real-time translation, history management, TTS, keyboard shortcuts
 */

(function () {
  'use strict';

  /* ==========================================================================
     CONFIGURATION
     ========================================================================== */
  const CONFIG = {
    API: {
      BASE_URL: 'https://translate.fedilab.app',
      ENDPOINT: '/translate',
      TIMEOUT: 15000,
      MAX_RETRIES: 2,
      RETRY_DELAY: 1000,
    },
    DEBOUNCE: {
      TRANSLATE: 800,
      SEARCH: 300,
    },
    STORAGE: {
      HISTORY_KEY: 'linguaai_history',
      FAVORITES_KEY: 'linguaai_favorites',
      LAST_TRANSLATION_KEY: 'linguaai_last',
    },
    MAX_CHARS: 5000,
    TYPED_STRINGS: [
      'translate("Hello world", "en", "id")',
      'translate("Bonjour le monde", "fr", "id")',
      'translate("Hola mundo", "es", "id")',
      'translate("Hallo Welt", "de", "id")',
      'translate("Ciao mondo", "it", "id")',
      'detect_language("Selamat pagi dunia")',
    ],
  };

  /* ==========================================================================
     STATE MANAGEMENT
     ========================================================================== */
  const state = {
    isTranslating: false,
    currentTranslation: null,
    debounceTimer: null,
    history: [],
    favorites: [],
    historyFilter: 'all',
    historySearchQuery: '',
  };

  /* ==========================================================================
     DOM REFERENCES
     ========================================================================== */
  const DOM = {};

  function cacheDOM() {
    DOM.navbar = document.getElementById('navbar');
    DOM.mobileMenuBtn = document.getElementById('mobile-menu-btn');
    DOM.mobileMenu = document.getElementById('mobile-menu');
    DOM.menuIconOpen = document.getElementById('menu-icon-open');
    DOM.menuIconClose = document.getElementById('menu-icon-close');
    DOM.sourceLang = document.getElementById('source-lang');
    DOM.targetLang = document.getElementById('target-lang');
    DOM.swapLang = document.getElementById('swap-lang');
    DOM.inputText = document.getElementById('input-text');
    DOM.outputText = document.getElementById('output-text');
    DOM.charCount = document.getElementById('char-count');
    DOM.detectedLang = document.getElementById('detected-lang');
    DOM.detectedLangText = document.getElementById('detected-lang-text');
    DOM.skeletonLoader = document.getElementById('skeleton-loader');
    DOM.translateTime = document.getElementById('translate-time');
    DOM.btnTranslate = document.getElementById('btn-translate');
    DOM.btnClear = document.getElementById('btn-clear');
    DOM.btnCopy = document.getElementById('btn-copy');
    DOM.btnFavorite = document.getElementById('btn-favorite');
    DOM.btnPaste = document.getElementById('btn-paste');
    DOM.btnSpeakSource = document.getElementById('btn-speak-source');
    DOM.btnSpeakTarget = document.getElementById('btn-speak-target');
    DOM.btnRetry = document.getElementById('btn-retry');
    DOM.errorState = document.getElementById('error-state');
    DOM.errorMessage = document.getElementById('error-message');
    DOM.favIconEmpty = document.getElementById('fav-icon-empty');
    DOM.favIconFilled = document.getElementById('fav-icon-filled');
    DOM.historyList = document.getElementById('history-list');
    DOM.historyEmpty = document.getElementById('history-empty');
    DOM.historySearch = document.getElementById('history-search');
    DOM.btnClearHistory = document.getElementById('btn-clear-history');
    DOM.historyTabs = document.querySelectorAll('.history-tab');
    DOM.faqTriggers = document.querySelectorAll('.faq-trigger');
  }

  /* ==========================================================================
     UTILITY FUNCTIONS
     ========================================================================== */
  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Baru saja';
    if (minutes < 60) return `${minutes}m lalu`;
    if (hours < 24) return `${hours}j lalu`;
    if (days < 7) return `${days}h lalu`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function truncateText(text, maxLength = 120) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /* ==========================================================================
     TOAST NOTIFICATIONS
     ========================================================================== */
  function showToast(message, type = 'success') {
    const labels = {
      success: 'Berhasil',
      error: 'Gagal',
      info: 'Info',
    };
    const colors = {
      success: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1))',
      error: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.1))',
      info: 'linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(59, 130, 246, 0.1))',
    };

    const textColors = {
      success: '#4ade80',
      error: '#f87171',
      info: '#22d3ee',
    };

    Toastify({
      text: message,
      duration: 3000,
      gravity: 'bottom',
      position: 'right',
      stopOnFocus: true,
      style: {
        background: colors[type],
        color: textColors[type],
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: '14px',
        fontWeight: '500',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      },
    }).showToast();
  }

  /* ==========================================================================
     LOCAL STORAGE
     ========================================================================== */
  function loadFromStorage(key, fallback = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('Penyimpanan gagal:', e);
    }
  }

  function loadHistory() {
    state.history = loadFromStorage(CONFIG.STORAGE.HISTORY_KEY);
  }

  function saveHistory() {
    saveToStorage(CONFIG.STORAGE.HISTORY_KEY, state.history);
  }

  function loadFavorites() {
    state.favorites = loadFromStorage(CONFIG.STORAGE.FAVORITES_KEY);
  }

  function saveFavorites() {
    saveToStorage(CONFIG.STORAGE.FAVORITES_KEY, state.favorites);
  }

  function loadLastTranslation() {
    return loadFromStorage(CONFIG.STORAGE.LAST_TRANSLATION_KEY, null);
  }

  function saveLastTranslation(data) {
    saveToStorage(CONFIG.STORAGE.LAST_TRANSLATION_KEY, data);
  }

  /* ==========================================================================
     TRANSLATION API
     ========================================================================== */
  async function translateText(text, source, target, retries = 0) {
    if (!text.trim()) {
      return { translatedText: '', detectedLanguage: null };
    }

    const url = `${CONFIG.API.BASE_URL}${CONFIG.API.ENDPOINT}`;
    const params = new URLSearchParams({
      q: text.trim(),
      source: source === 'auto' ? 'auto' : source,
      target: target,
      format: 'text',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.API.TIMEOUT);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text.trim(),
          source: source === 'auto' ? 'auto' : source,
          target: target,
          format: 'text',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        translatedText: data.translatedText || '',
        detectedLanguage: data.detectedLanguage?.language || null,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Permintaan habis waktu. Silakan coba lagi.');
      }

      if (retries < CONFIG.API.MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, CONFIG.API.RETRY_DELAY * (retries + 1)));
        return translateText(text, source, target, retries + 1);
      }

      throw error;
    }
  }

  /* ==========================================================================
     UI STATE MANAGEMENT
     ========================================================================== */
  function setLoading(isLoading) {
    state.isTranslating = isLoading;
    DOM.btnTranslate.classList.toggle('loading', isLoading);
    DOM.btnTranslate.disabled = isLoading;
    DOM.skeletonLoader.classList.toggle('hidden', !isLoading);
    DOM.errorState.classList.add('hidden');

    if (isLoading) {
      DOM.outputText.innerHTML = '';
    }
  }

  function showError(message) {
    DOM.errorState.classList.remove('hidden');
    DOM.errorMessage.textContent = message;
    DOM.skeletonLoader.classList.add('hidden');
  }

  function hideError() {
    DOM.errorState.classList.add('hidden');
  }

  function updateCharCount() {
    const length = DOM.inputText.value.length;
    DOM.charCount.textContent = `${length} / ${CONFIG.MAX_CHARS}`;

    if (length > CONFIG.MAX_CHARS * 0.9) {
      DOM.charCount.classList.add('text-red-400');
      DOM.charCount.classList.remove('text-surface-600');
    } else {
      DOM.charCount.classList.remove('text-red-400');
      DOM.charCount.classList.add('text-surface-600');
    }
  }

  function updateDetectedLanguage(lang) {
    if (lang) {
      DOM.detectedLangText.textContent = getLanguageName(lang);
      DOM.detectedLang.classList.remove('hidden');
    } else {
      DOM.detectedLang.classList.add('hidden');
    }
  }

  function updateTranslateTime(ms) {
    if (ms) {
      DOM.translateTime.textContent = `${ms}ms`;
    } else {
      DOM.translateTime.textContent = '';
    }
  }

  function updateFavoriteIcon() {
    const isFav = state.currentTranslation && state.favorites.some((f) => f.id === state.currentTranslation.id);
    DOM.favIconEmpty.classList.toggle('hidden', isFav);
    DOM.favIconFilled.classList.toggle('hidden', !isFav);
  }

  function getLanguageName(code) {
    const languages = {
      auto: 'Deteksi Otomatis',
      en: 'Inggris',
      id: 'Indonesia',
      es: 'Spanyol',
      fr: 'Prancis',
      de: 'Jerman',
      it: 'Italia',
      pt: 'Portugis',
      'pt-BR': 'Portugis (Brazil)',
      ru: 'Rusia',
      ja: 'Jepang',
      ko: 'Korea',
      zh: 'Mandarin',
      'zh-Hans': 'Mandarin (Sederhana)',
      'zh-Hant': 'Mandarin (Tradisional)',
      ar: 'Arab',
      hi: 'Hindi',
      nl: 'Belanda',
      pl: 'Polandia',
      tr: 'Turki',
      sv: 'Swedia',
      th: 'Thai',
      vi: 'Vietnam',
      ms: 'Melayu',
    };
    return languages[code] || code;
  }

  /* ==========================================================================
     TRANSLATION HANDLER
     ========================================================================== */
  async function handleTranslate() {
    const text = DOM.inputText.value.trim();
    const source = DOM.sourceLang.value;
    const target = DOM.targetLang.value;

    if (!text) {
      DOM.outputText.innerHTML = '<span class="text-surface-600">Hasil terjemahan akan muncul di sini...</span>';
      updateDetectedLanguage(null);
      updateTranslateTime(null);
      state.currentTranslation = null;
      updateFavoriteIcon();
      return;
    }

    if (text.length > CONFIG.MAX_CHARS) {
      showError(`Teks melebihi batas maksimal ${CONFIG.MAX_CHARS} karakter.`);
      return;
    }

    setLoading(true);
    hideError();

    const startTime = performance.now();

    try {
      const result = await translateText(text, source, target);
      const elapsed = Math.round(performance.now() - startTime);

      DOM.outputText.textContent = result.translatedText;
      updateDetectedLanguage(result.detectedLanguage);
      updateTranslateTime(elapsed);

      state.currentTranslation = {
        id: generateId(),
        sourceText: text,
        translatedText: result.translatedText,
        sourceLang: result.detectedLanguage || source,
        targetLang: target,
        timestamp: Date.now(),
        isFavorite: false,
      };

      addToHistory(state.currentTranslation);
      saveLastTranslation({
        sourceText: text,
        translatedText: result.translatedText,
        sourceLang: result.detectedLanguage || source,
        targetLang: target,
      });

      updateFavoriteIcon();
    } catch (error) {
      console.error('Translation error:', error);
      showError(error.message || 'Terjemahan gagal. Periksa koneksi Anda dan coba lagi.');
      updateTranslateTime(null);
    } finally {
      setLoading(false);
    }
  }

  const debouncedTranslate = debounce(handleTranslate, CONFIG.DEBOUNCE.TRANSLATE);

  /* ==========================================================================
     HISTORY MANAGEMENT
     ========================================================================== */
  function addToHistory(translation) {
    const exists = state.history.find(
      (h) => h.sourceText === translation.sourceText && h.targetLang === translation.targetLang
    );

    if (exists) {
      exists.timestamp = Date.now();
      exists.translatedText = translation.translatedText;
    } else {
      state.history.unshift({ ...translation });
    }

    if (state.history.length > 100) {
      state.history = state.history.slice(0, 100);
    }

    saveHistory();
    renderHistory();
  }

  function deleteHistoryItem(id) {
    state.history = state.history.filter((h) => h.id !== id);
    saveHistory();
    renderHistory();
      showToast('Terjemahan dihapus', 'info');
  }

  function toggleFavorite(id) {
    const item = state.history.find((h) => h.id === id);
    if (!item) return;

    const existingIndex = state.favorites.findIndex((f) => f.id === id);
    if (existingIndex > -1) {
      state.favorites.splice(existingIndex, 1);
      item.isFavorite = false;
      showToast('Dihapus dari favorit', 'info');
    } else {
      state.favorites.unshift({ ...item });
      item.isFavorite = true;
      showToast('Ditambahkan ke favorit', 'success');
    }

    saveFavorites();
    saveHistory();
    renderHistory();
    updateFavoriteIcon();
  }

  function clearHistory() {
    if (state.history.length === 0) return;

    if (confirm('Yakin ingin menghapus semua riwayat terjemahan?')) {
      state.history = [];
      saveHistory();
      renderHistory();
      showToast('Riwayat dihapus', 'info');
    }
  }

  function getFilteredHistory() {
    let filtered = [...state.history];

    if (state.historyFilter === 'favorites') {
      filtered = filtered.filter((h) => h.isFavorite);
    }

    if (state.historySearchQuery) {
      const query = state.historySearchQuery.toLowerCase();
      filtered = filtered.filter(
        (h) =>
          h.sourceText.toLowerCase().includes(query) ||
          h.translatedText.toLowerCase().includes(query)
      );
    }

    return filtered;
  }

  function renderHistory() {
    const filtered = getFilteredHistory();

    if (filtered.length === 0) {
      DOM.historyList.innerHTML = '';
      DOM.historyList.appendChild(DOM.historyEmpty);
      DOM.historyEmpty.classList.remove('hidden');
      return;
    }

    DOM.historyEmpty.classList.add('hidden');

    DOM.historyList.innerHTML = filtered
      .map(
        (item) => `
      <div class="history-item p-4 sm:p-5" data-id="${item.id}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <span class="inline-flex items-center gap-1.5 rounded-lg bg-accent-cyan/10 px-2.5 py-1 text-xs font-medium text-accent-cyan">
                ${getLanguageName(item.sourceLang)}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-surface-600"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              <span class="inline-flex items-center gap-1.5 rounded-lg bg-accent-purple/10 px-2.5 py-1 text-xs font-medium text-accent-purple">
                ${getLanguageName(item.targetLang)}
              </span>
              <span class="ml-auto text-xs text-surface-600">${formatDate(item.timestamp)}</span>
            </div>
            <p class="text-sm text-surface-300 truncate">${escapeHtml(truncateText(item.sourceText, 150))}</p>
            <p class="text-sm text-white mt-1 truncate">${escapeHtml(truncateText(item.translatedText, 150))}</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button class="history-action-btn p-2 rounded-lg text-surface-500 hover:text-yellow-400 hover:bg-white/5 transition-colors" data-action="favorite" data-id="${item.id}" aria-label="Toggle favorite">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${item.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
              <button class="history-action-btn p-2 rounded-lg text-surface-500 hover:text-accent-cyan hover:bg-white/5 transition-colors" data-action="copy" data-id="${item.id}" aria-label="Salin terjemahan">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
            <button class="history-action-btn p-2 rounded-lg text-surface-500 hover:text-red-400 hover:bg-white/5 transition-colors" data-action="delete" data-id="${item.id}" aria-label="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
          </div>
        </div>
      </div>
    `
      )
      .join('');
  }

  /* ==========================================================================
     TEXT-TO-SPEECH
     ========================================================================== */
  function speak(text, lang) {
    if (!text || !('speechSynthesis' in window)) {
      showToast('Text-to-speech tidak didukung di browser ini', 'error');
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'auto' ? 'en' : lang;
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onerror = () => {
      showToast('Sintesis suara gagal', 'error');
    };

    window.speechSynthesis.speak(utterance);
    showToast('Memutar audio...', 'info');
  }

  /* ==========================================================================
     COPY TO CLIPBOARD
     ========================================================================== */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Disalin ke clipboard', 'success');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('Disalin ke clipboard', 'success');
    }
  }

  /* ==========================================================================
     NAVBAR
     ========================================================================== */
  function initNavbar() {
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
      const currentScroll = window.scrollY;

      if (currentScroll > 50) {
        DOM.navbar.classList.add('scrolled');
      } else {
        DOM.navbar.classList.remove('scrolled');
      }

      lastScroll = currentScroll;
    }, { passive: true });

    DOM.mobileMenuBtn.addEventListener('click', () => {
      const isOpen = !DOM.mobileMenu.classList.contains('hidden');
      DOM.mobileMenu.classList.toggle('hidden');
      DOM.menuIconOpen.classList.toggle('hidden');
      DOM.menuIconClose.classList.toggle('hidden');

      if (!isOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    });

    document.querySelectorAll('.mobile-nav-link, .nav-link, .nav-cta').forEach((link) => {
      link.addEventListener('click', () => {
        if (!DOM.mobileMenu.classList.contains('hidden')) {
          DOM.mobileMenu.classList.add('hidden');
          DOM.menuIconOpen.classList.remove('hidden');
          DOM.menuIconClose.classList.add('hidden');
          document.body.style.overflow = '';
        }
      });
    });

    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -80% 0px',
      threshold: 0,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navLinks.forEach((link) => {
            link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
          });
        }
      });
    }, observerOptions);

    sections.forEach((section) => observer.observe(section));
  }

  /* ==========================================================================
     TYPING ANIMATION
     ========================================================================== */
  function initTyped() {
    const typedOutput = document.getElementById('typed-output');
    if (!typedOutput || typeof Typed === 'undefined') return;

    new Typed('#typed-output', {
      strings: CONFIG.TYPED_STRINGS,
      typeSpeed: 40,
      backSpeed: 25,
      backDelay: 2000,
      startDelay: 1000,
      loop: true,
      showCursor: false,
    });
  }

  /* ==========================================================================
     COUNTER ANIMATION
     ========================================================================== */
  function initCounters() {
    const counters = document.querySelectorAll('.counter');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !entry.target.dataset.animated) {
            entry.target.dataset.animated = 'true';
            animateCounter(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((counter) => observer.observe(counter));
  }

  function animateCounter(element) {
    const target = parseInt(element.dataset.target, 10);
    const suffix = element.dataset.suffix || '';
    const duration = 2000;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);

      if (target > 10000) {
        element.textContent = (current / 1000000).toFixed(1) + 'M';
      } else {
        element.textContent = current.toLocaleString();
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        if (target > 10000) {
          element.textContent = (target / 1000000).toFixed(1) + 'M';
        } else {
          element.textContent = target.toLocaleString();
        }
        if (suffix) element.textContent += suffix;
      }
    }

    requestAnimationFrame(update);
  }

  /* ==========================================================================
     FAQ ACCORDION
     ========================================================================== */
  function initFAQ() {
    DOM.faqTriggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const item = trigger.closest('.faq-item');
        const content = item.querySelector('.faq-content');
        const isOpen = item.classList.contains('open');

        document.querySelectorAll('.faq-item.open').forEach((openItem) => {
          if (openItem !== item) {
            openItem.classList.remove('open');
            openItem.querySelector('.faq-trigger').setAttribute('aria-expanded', 'false');
            openItem.querySelector('.faq-content').classList.add('hidden');
          }
        });

        item.classList.toggle('open', !isOpen);
        trigger.setAttribute('aria-expanded', !isOpen);
        content.classList.toggle('hidden', isOpen);
      });
    });
  }

  /* ==========================================================================
     EVENT LISTENERS
     ========================================================================== */
  function initEventListeners() {
    DOM.inputText.addEventListener('input', () => {
      updateCharCount();
      debouncedTranslate();
    });

    DOM.sourceLang.addEventListener('change', () => {
      if (DOM.inputText.value.trim()) {
        handleTranslate();
      }
    });

    DOM.targetLang.addEventListener('change', () => {
      if (DOM.inputText.value.trim()) {
        handleTranslate();
      }
    });

    DOM.swapLang.addEventListener('click', () => {
      const sourceVal = DOM.sourceLang.value;
      const targetVal = DOM.targetLang.value;

      if (sourceVal === 'auto') {
        showToast('Tidak bisa menukar saat deteksi otomatis aktif', 'info');
        return;
      }

      DOM.sourceLang.value = targetVal;
      DOM.targetLang.value = sourceVal;

      if (DOM.inputText.value.trim()) {
        handleTranslate();
      }

      anime({
        targets: DOM.swapLang.querySelector('svg'),
        rotate: '180deg',
        duration: 300,
        easing: 'easeInOutQuad',
      });
    });

    DOM.btnTranslate.addEventListener('click', handleTranslate);

    DOM.btnClear.addEventListener('click', () => {
      DOM.inputText.value = '';
      DOM.outputText.innerHTML = '<span class="text-surface-600">Translation will appear here...</span>';
      updateCharCount();
      updateDetectedLanguage(null);
      updateTranslateTime(null);
      state.currentTranslation = null;
      updateFavoriteIcon();
      DOM.inputText.focus();
    });

    DOM.btnCopy.addEventListener('click', () => {
      const text = DOM.outputText.textContent;
      if (text && text !== 'Hasil terjemahan akan muncul di sini...') {
        copyToClipboard(text);
      }
    });

    DOM.btnFavorite.addEventListener('click', () => {
      if (state.currentTranslation) {
        toggleFavorite(state.currentTranslation.id);
      } else {
        showToast('Terjemahkan sesuatu terlebih dahulu untuk menyimpan', 'info');
      }
    });

    DOM.btnPaste.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        DOM.inputText.value = text;
        updateCharCount();
        debouncedTranslate();
        showToast('Ditempel dari clipboard', 'success');
      } catch {
        showToast('Tidak bisa mengakses clipboard', 'error');
      }
    });

    DOM.btnSpeakSource.addEventListener('click', () => {
      const text = DOM.inputText.value;
      const lang = DOM.sourceLang.value;
      if (text) {
        speak(text, lang);
      }
    });

    DOM.btnSpeakTarget.addEventListener('click', () => {
      const text = DOM.outputText.textContent;
      const lang = DOM.targetLang.value;
      if (text && text !== 'Hasil terjemahan akan muncul di sini...') {
        speak(text, lang);
      }
    });

    DOM.btnRetry.addEventListener('click', handleTranslate);

    DOM.historySearch.addEventListener('input', debounce((e) => {
      state.historySearchQuery = e.target.value;
      renderHistory();
    }, CONFIG.DEBOUNCE.SEARCH));

    DOM.btnClearHistory.addEventListener('click', clearHistory);

    DOM.historyTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        DOM.historyTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.historyFilter = tab.dataset.filter;
        renderHistory();
      });
    });

    DOM.historyList.addEventListener('click', (e) => {
      const btn = e.target.closest('.history-action-btn');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'favorite':
          toggleFavorite(id);
          break;
        case 'copy':
          const item = state.history.find((h) => h.id === id);
          if (item) copyToClipboard(item.translatedText);
          break;
        case 'delete':
          deleteHistoryItem(id);
          break;
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (DOM.inputText.value.trim()) {
          handleTranslate();
        }
      }
    });
  }

  /* ==========================================================================
     SCROLL REVEAL ANIMATION
     ========================================================================== */
  function initScrollReveal() {
    if (typeof AOS === 'undefined') return;

    AOS.init({
      duration: 700,
      easing: 'ease-out-cubic',
      once: true,
      offset: 80,
      disable: 'mobile',
    });
  }

  /* ==========================================================================
     RESTORE LAST TRANSLATION
     ========================================================================== */
  function restoreLastTranslation() {
    const last = loadLastTranslation();
    if (last && last.sourceText) {
      DOM.inputText.value = last.sourceText;
      updateCharCount();
    }
  }

  /* ==========================================================================
     INITIALIZATION
     ========================================================================== */
  function init() {
    cacheDOM();
    loadHistory();
    loadFavorites();
    initNavbar();
    initTyped();
    initCounters();
    initFAQ();
    initEventListeners();
    initScrollReveal();
    restoreLastTranslation();
    renderHistory();
    updateCharCount();

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
