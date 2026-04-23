(function () {
  'use strict';

  // Configuration
  const CONFIG = {
    API_BASE: 'https://nit.asere.dev', // Default API base
    TRACKING_CODE: null,
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    HEARTBEAT_INTERVAL: 30 * 1000, // 30 seconds
    BATCH_SIZE: 10,
    BATCH_TIMEOUT: 5000, // 5 seconds
    SCROLL_THRESHOLD: [25, 50, 75, 100], // Scroll depth percentages
    RAGE_CLICK_THRESHOLD: 3, // Number of clicks in short time
    RAGE_CLICK_TIME: 1000, // Time window for rage clicks (ms)
  };

  // State management
  let state = {
    visitorId: null,
    sessionId: null,
    sessionStart: null,
    lastActivity: null,
    pageStartTime: null,
    eventQueue: [],
    isInitialized: false,
    sessionEnded: false,
    heartbeatInterval: null,
    durationConversionInterval: null,
    scrollDepths: new Set(),
    lastScrollTime: 0,
    clickTimes: [],
    performanceTracked: false,
    excludedPaths: [], // Paths to exclude from tracking
    pageViewCount: 0, // Track actual page views across the session
    currentPath: null, // Track current path for SPA dedup
    cookieConsent: null, // Analytics consent config from server
    consentGiven: null, // null = not decided, object = categories accepted
  };

  // Utility functions
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getStorageItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function setStorageItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Ignore storage errors
    }
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  function setCookie(name, value, days = 365) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
  }

  function getVisitorId() {
    let visitorId = getStorageItem('analytics_visitor_id') || getCookie('analytics_visitor_id');
    if (!visitorId) {
      visitorId = generateId();
      setStorageItem('analytics_visitor_id', visitorId);
      setCookie('analytics_visitor_id', visitorId);
    }
    return visitorId;
  }

  function getSessionId() {
    const now = Date.now();
    let sessionId = getStorageItem('analytics_session_id');
    let sessionStart = parseInt(getStorageItem('analytics_session_start') || '0');
    let lastActivity = parseInt(getStorageItem('analytics_last_activity') || '0');

    // Check if session expired based on last activity, not session start
    if (!sessionId || (now - (lastActivity || sessionStart)) > CONFIG.SESSION_TIMEOUT) {
      sessionId = generateId();
      sessionStart = now;
      setStorageItem('analytics_session_id', sessionId);
      setStorageItem('analytics_session_start', sessionStart.toString());
      setStorageItem('analytics_last_activity', now.toString());
    }

    return { sessionId, sessionStart };
  }

  // Check if current path should be excluded from tracking
  function isPathExcluded(path) {
    if (!state.excludedPaths || state.excludedPaths.length === 0) {
      return false;
    }

    return state.excludedPaths.some(pattern => {
      // Convert wildcard pattern to regex
      // /admin/* becomes /^\/admin\/.*$/
      const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
        .replace(/\*/g, '.*'); // Convert * to .*

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(path);
    });
  }

  // Enhanced device detection
  function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';
    let device = 'Desktop';

    // Detect browser with version (improved detection)
    if (ua.includes('Edg/') || ua.includes('Edge/')) {
      browser = 'Edge';
    } else if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) {
      browser = 'Chrome';
    } else if (ua.includes('Firefox')) {
      browser = 'Firefox';
    } else if (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')) {
      browser = 'Safari';
    } else if (ua.includes('Opera') || ua.includes('OPR')) {
      browser = 'Opera';
    } else if (ua.includes('Brave')) {
      browser = 'Brave';
    } else if (ua.includes('YaBrowser')) {
      browser = 'Yandex';
    }

    // Detect OS
    if (ua.includes('Windows NT 10.0')) os = 'Windows 10';
    else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
    else if (ua.includes('Windows NT 6.2')) os = 'Windows 8';
    else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    // Detect device type (improved detection like Umami)
    const screenWidth = screen.width;
    if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      device = 'Mobile';
    } else if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (screenWidth && screenWidth < 1024 && /Touch/i.test(ua))) {
      device = 'Tablet';
    } else if (screenWidth && screenWidth <= 1920) {
      device = 'Laptop';
    } else {
      device = 'Desktop';
    }

    // Enhanced info
    const screenResolution = `${screen.width}x${screen.height}`;
    const viewport = `${window.innerWidth}x${window.innerHeight}`;
    const pixelRatio = window.devicePixelRatio || 1;
    const language = navigator.language || navigator.userLanguage || 'unknown';
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const cookieEnabled = navigator.cookieEnabled;
    const doNotTrack = navigator.doNotTrack === '1' || window.doNotTrack === '1';

    // Connection info
    let connection = 'unknown';
    if (navigator.connection) {
      connection = navigator.connection.effectiveType || navigator.connection.type || 'unknown';
    }

    return {
      browser,
      os,
      device,
      screenResolution,
      viewport,
      pixelRatio,
      language,
      timezone,
      connection,
      cookieEnabled,
      doNotTrack,
    };
  }

  // UTM and traffic source detection
  function getTrafficSource() {
    const urlParams = new URLSearchParams(window.location.search);
    const referrer = document.referrer;

    // Extract UTM parameters
    const utmSource = urlParams.get('utm_source');
    const utmMedium = urlParams.get('utm_medium');
    const utmCampaign = urlParams.get('utm_campaign');
    const utmTerm = urlParams.get('utm_term');
    const utmContent = urlParams.get('utm_content');

    // Also check common ref/source params (Product Hunt, newsletters, etc.)
    var refParam = urlParams.get('ref') || urlParams.get('source') || urlParams.get('via');

    // Classify traffic source
    let source = 'direct';
    let medium = null;
    let referrerDomain = null;
    let isSearchEngine = false;
    let searchEngine = null;
    let socialNetwork = null;

    if (utmSource) {
      source = utmSource;
      medium = utmMedium;
    } else if (refParam) {
      source = refParam;
      medium = 'referral';
    } else if (referrer) {
      try {
        const refUrl = new URL(referrer);
        referrerDomain = refUrl.hostname.replace('www.', '');

        // Check if search engine
        const searchEngines = {
          'google': 'Google',
          'bing': 'Bing',
          'yahoo': 'Yahoo',
          'duckduckgo': 'DuckDuckGo',
          'baidu': 'Baidu',
          'yandex': 'Yandex',
        };

        for (const [key, name] of Object.entries(searchEngines)) {
          if (referrerDomain.includes(key)) {
            source = 'organic';
            medium = 'search';
            isSearchEngine = true;
            searchEngine = name;
            break;
          }
        }

        // Check if social network
        if (!isSearchEngine) {
          const socialNetworks = {
            'facebook.com': 'Facebook',
            'twitter.com': 'Twitter',
            'x.com': 'X (Twitter)',
            'linkedin.com': 'LinkedIn',
            'instagram.com': 'Instagram',
            'pinterest.com': 'Pinterest',
            'reddit.com': 'Reddit',
            'tiktok.com': 'TikTok',
            'youtube.com': 'YouTube',
          };

          for (const [domain, name] of Object.entries(socialNetworks)) {
            if (referrerDomain.includes(domain)) {
              source = 'social';
              medium = name.toLowerCase();
              socialNetwork = name;
              break;
            }
          }
        }

        // If not search or social, it's referral
        if (!isSearchEngine && !socialNetwork) {
          source = 'referral';
          medium = 'referral';
        }
      } catch (e) {
        // Invalid referrer URL
      }
    }

    return {
      utmSource: utmSource || null,
      utmMedium: utmMedium || null,
      utmCampaign: utmCampaign || null,
      utmTerm: utmTerm || null,
      utmContent: utmContent || null,
      source,
      medium,
      referrerDomain,
      isSearchEngine,
      searchEngine,
      socialNetwork,
    };
  }

  function getCurrentPage() {
    return {
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer || null,
      hash: window.location.hash,
      search: window.location.search,
    };
  }

  // Performance metrics — use modern PerformanceNavigationTiming API
  function getPerformanceMetrics() {
    if (!window.performance) return null;

    var entries = window.performance.getEntriesByType && window.performance.getEntriesByType('navigation');
    var nav = entries && entries[0];

    var loadTime, domContentLoaded, timeToInteractive, navigationType;

    if (nav) {
      // Modern API — values are relative to startTime (0), always positive
      loadTime = Math.round(nav.loadEventEnd || nav.domComplete || 0);
      domContentLoaded = Math.round(nav.domContentLoadedEventEnd || 0);
      timeToInteractive = Math.round(nav.domInteractive || 0);
      navigationType = nav.type === 'reload' ? 1 : nav.type === 'back_forward' ? 2 : 0;
    } else if (window.performance.timing) {
      // Legacy fallback
      var timing = window.performance.timing;
      loadTime = timing.loadEventEnd - timing.navigationStart;
      domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
      timeToInteractive = timing.domInteractive - timing.navigationStart;
      navigationType = window.performance.navigation ? window.performance.navigation.type : 0;
    } else {
      return null;
    }

    // Validate — discard negative or absurdly large values (> 5 min)
    if (loadTime <= 0 || loadTime > 300000) loadTime = 0;
    if (domContentLoaded <= 0 || domContentLoaded > 300000) domContentLoaded = 0;
    if (timeToInteractive <= 0 || timeToInteractive > 300000) timeToInteractive = 0;

    // Skip if we have no valid data
    if (loadTime === 0 && domContentLoaded === 0 && timeToInteractive === 0) return null;

    var firstPaint = null;
    var firstContentfulPaint = null;

    if (window.performance.getEntriesByType) {
      var paintEntries = window.performance.getEntriesByType('paint');
      paintEntries.forEach(function(entry) {
        if (entry.name === 'first-paint') {
          firstPaint = Math.round(entry.startTime);
        } else if (entry.name === 'first-contentful-paint') {
          firstContentfulPaint = Math.round(entry.startTime);
        }
      });
    }

    return {
      loadTime: loadTime,
      domContentLoaded: domContentLoaded,
      timeToInteractive: timeToInteractive,
      firstPaint: firstPaint,
      firstContentfulPaint: firstContentfulPaint,
      navigationType: navigationType,
    };
  }

  // API functions
  async function sendRequest(endpoint, data) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/api/track/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          trackingCode: CONFIG.TRACKING_CODE,
          timestamp: data.timestamp || new Date().toISOString()
        }),
        // Use keepalive for better reliability on page unload
        keepalive: true
      });

      if (!response.ok) {
        console.warn(`Analytics tracking failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('Analytics tracking error:', error);
    }
  }

  function queueEvent(type, data) {
    state.eventQueue.push({
      type,
      data: {
        ...data,
        visitorId: state.visitorId,
        sessionId: state.sessionId,
        timestamp: Date.now()
      }
    });

    // Process queue if it's full or after timeout
    if (state.eventQueue.length >= CONFIG.BATCH_SIZE) {
      processEventQueue();
    } else {
      setTimeout(processEventQueue, CONFIG.BATCH_TIMEOUT);
    }
  }

  async function processEventQueue() {
    if (state.eventQueue.length === 0) return;

    const events = state.eventQueue.splice(0, CONFIG.BATCH_SIZE);

    // Use batch endpoint to send all events in a single request
    try {
      const payload = events.map(function(event) {
        return {
          type: event.type,
          trackingCode: CONFIG.TRACKING_CODE,
          timestamp: event.data.timestamp || new Date().toISOString(),
          ...event.data
        };
      });

      var response = await fetch(CONFIG.API_BASE + '/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      });

      if (!response.ok) {
        console.warn('Analytics batch failed: ' + response.status);
        // Fallback: send individually
        for (var i = 0; i < events.length; i++) {
          await sendRequest(events[i].type, events[i].data);
        }
      }
    } catch (error) {
      console.warn('Analytics batch error:', error);
      // Fallback: send individually
      for (var j = 0; j < events.length; j++) {
        await sendRequest(events[j].type, events[j].data);
      }
    }
  }

  // Send session update when session ends
  async function sendSessionUpdate(duration, pageViewCount, isBounce) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/api/track/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingCode: CONFIG.TRACKING_CODE,
          visitorId: state.visitorId,
          sessionId: state.sessionId,
          duration: duration,
          pageViewCount: pageViewCount,
          isBounce: isBounce,
          timestamp: new Date().toISOString()
        }),
        keepalive: true
      });
    } catch (error) {
      console.warn('Session update failed:', error);
    }
  }

  // Tracking functions
  async function trackPageView() {
    const page = getCurrentPage();

    // Check if this path should be excluded
    if (isPathExcluded(page.path)) {
      return;
    }

    const deviceInfo = getDeviceInfo();
    const trafficSource = getTrafficSource();

    // Send pageview directly (don't queue) to ensure proper order
    await sendRequest('pageview', {
      visitorId: state.visitorId,
      sessionId: state.sessionId,
      page: page.path,
      title: page.title,
      referrer: page.referrer,
      url: page.url,
      userAgent: navigator.userAgent,
      ...deviceInfo,
      ...trafficSource,
    });

    state.pageViewCount++;
    state.currentPath = page.path;
    state.pageStartTime = Date.now();
    state.lastActivity = Date.now();
    state.scrollDepths.clear();
    state.performanceTracked = false;

    // Track performance metrics after page load
    if (document.readyState === 'complete') {
      trackPerformance();
    } else {
      window.addEventListener('load', trackPerformance, { once: true });
    }
  }

  async function trackSession() {
    const deviceInfo = getDeviceInfo();
    const page = getCurrentPage();
    const trafficSource = getTrafficSource();

    // Send session directly (don't queue) to ensure proper order
    await sendRequest('session', {
      visitorId: state.visitorId,
      sessionId: state.sessionId,
      referrer: page.referrer,
      landingPage: page.path,
      userAgent: navigator.userAgent,
      ...deviceInfo,
      ...trafficSource,
    });
  }

  function trackPerformance() {
    if (state.performanceTracked) return;

    setTimeout(() => {
      const metrics = getPerformanceMetrics();
      if (metrics) {
        const page = getCurrentPage();
        trackEvent('performance', 'page_performance', {
          page: page.path,
          ...metrics,
        });
        state.performanceTracked = true;
      }
    }, 1000); // Wait 1 second for metrics to stabilize
  }

  function trackEvent(eventType, eventName, properties = {}) {
    if (!isTrackingAllowed()) return;
    const page = getCurrentPage();

    queueEvent('event', {
      eventType,
      eventName,
      page: page.path,
      properties
    });

    // Check for event-based conversions
    trackConversion({
      eventName: eventName,
      metadata: properties,
    });
  }

  // Scroll depth tracking
  function trackScrollDepth() {
    const now = Date.now();
    if (now - state.lastScrollTime < 500) return; // Throttle
    state.lastScrollTime = now;

    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrolled = window.scrollY;
    const percentage = scrollHeight > 0 ? Math.round((scrolled / scrollHeight) * 100) : 100;

    CONFIG.SCROLL_THRESHOLD.forEach(threshold => {
      if (percentage >= threshold && !state.scrollDepths.has(threshold)) {
        state.scrollDepths.add(threshold);
        trackEvent('engagement', 'scroll_depth', {
          depth: threshold,
          page: window.location.pathname,
        });
      }
    });
  }

  // Rage click detection
  function trackClick(event) {
    const now = Date.now();
    state.clickTimes.push(now);

    // Remove clicks older than threshold
    state.clickTimes = state.clickTimes.filter(time => now - time < CONFIG.RAGE_CLICK_TIME);

    // Check for rage click
    if (state.clickTimes.length >= CONFIG.RAGE_CLICK_THRESHOLD) {
      const target = event.target;
      const element = {
        tag: target.tagName,
        id: target.id || null,
        class: target.className || null,
        text: target.textContent?.substring(0, 50) || null,
      };

      trackEvent('engagement', 'rage_click', {
        element,
        clickCount: state.clickTimes.length,
      });

      state.clickTimes = []; // Reset
    }
  }

  // Exit intent detection
  function trackExitIntent(event) {
    if (event.clientY <= 0 && event.relatedTarget == null) {
      trackEvent('engagement', 'exit_intent', {
        page: window.location.pathname,
      });

      // Only track once per page
      document.removeEventListener('mouseout', trackExitIntent);
    }
  }

  function updateActivity() {
    state.lastActivity = Date.now();
  }

  function startHeartbeat() {
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
    }

    state.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - state.lastActivity;

      // If user has been inactive for more than session timeout, end session
      if (timeSinceActivity > CONFIG.SESSION_TIMEOUT) {
        endSession();
        return;
      }

      // Update session activity
      setStorageItem('analytics_last_activity', now.toString());
    }, CONFIG.HEARTBEAT_INTERVAL);
  }

  function endSession() {
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
      state.heartbeatInterval = null;
    }

    if (state.durationConversionInterval) {
      clearInterval(state.durationConversionInterval);
      state.durationConversionInterval = null;
    }

    // Only send data if tracking was allowed
    if (isTrackingAllowed()) {
      // Calculate session duration and bounce rate — only send once per session
      if (state.sessionStart && !state.sessionEnded) {
        state.sessionEnded = true;
        const sessionDuration = Math.floor((Date.now() - state.sessionStart) / 1000);
        const isBounce = state.pageViewCount <= 1;

        sendSessionUpdate(sessionDuration, state.pageViewCount, isBounce);
      }
      // Calculate time on page
      if (state.pageStartTime) {
        const timeOnPage = Math.floor((Date.now() - state.pageStartTime) / 1000);
        trackEvent('timing', 'time_on_page', { duration: timeOnPage });
      }

      // Process any remaining events
      processEventQueue();
    }
  }

  // SPA-aware pageview that only fires when path actually changes
  function trackPageViewIfChanged() {
    if (!isTrackingAllowed()) return;
    const newPath = window.location.pathname;
    if (newPath !== state.currentPath) {
      trackPageView();
    }
  }

  // Event listeners
  function setupEventListeners() {
    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (state.heartbeatInterval) {
          clearInterval(state.heartbeatInterval);
          state.heartbeatInterval = null;
        }
        // Send session end on hidden (reliable on mobile)
        endSession();
      } else {
        // Page became visible again — if session was ended, it stays ended
        // A new page load will create a new session
        if (!state.sessionEnded) {
          updateActivity();
          startHeartbeat();
        }
      }
    });

    // pagehide is more reliable than beforeunload on mobile
    window.addEventListener('pagehide', () => {
      endSession();
    });

    // Track user activity
    ['mousedown', 'mousemove', 'keypress', 'touchstart'].forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    // Track scroll depth
    document.addEventListener('scroll', trackScrollDepth, { passive: true });

    // Track clicks for rage click detection
    document.addEventListener('click', trackClick, { passive: true });

    // Track exit intent
    document.addEventListener('mouseout', trackExitIntent);

    // Track page unload (keep for desktop browsers)
    window.addEventListener('beforeunload', () => {
      endSession();
    });

    // Track hash changes (SPA navigation)
    window.addEventListener('hashchange', () => {
      trackPageViewIfChanged();
    });

    // Track history changes (SPA navigation)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
      originalPushState.apply(history, arguments);
      setTimeout(trackPageViewIfChanged, 0);
    };

    // replaceState: only track if path actually changed (Next.js uses replaceState
    // for scroll restoration, prefetching, etc. — not real navigation)
    history.replaceState = function () {
      originalReplaceState.apply(history, arguments);
      setTimeout(trackPageViewIfChanged, 0);
    };

    window.addEventListener('popstate', () => {
      trackPageViewIfChanged();
    });
  }

  // Initialization
  // Load website configuration from server
  // Returns false if site is inactive/not found (tracking should not start)
  async function loadWebsiteConfig() {
    try {
      var response = await fetch(CONFIG.API_BASE + '/api/websites/config/' + CONFIG.TRACKING_CODE);
      if (!response.ok) {
        // Site not found or inactive — stop tracking entirely
        return false;
      }
      var config = await response.json();
      state.excludedPaths = config.excludedPaths || [];
      state.cookieConsent = config.cookieConsent || null;

      // Speed Insights — lazy-load optional module
      if (config.speedInsights) {
        window.__SI_SITE = CONFIG.TRACKING_CODE;
        window.__SI_EP = CONFIG.API_BASE;
        var si = document.createElement('script');
        si.src = CONFIG.API_BASE + '/speed-insights.js';
        si.async = true;
        document.head.appendChild(si);
      }

      // Load saved consent from localStorage
      if (state.cookieConsent && state.cookieConsent.enabled) {
        try {
          var saved = localStorage.getItem('analytics_consent');
          if (saved) {
            state.consentGiven = JSON.parse(saved);
          }
        } catch (e) { /* ignore */ }
      }
      return true;
    } catch (error) {
      // Network error — silently fail, don't block
      return true;
    }
  }

  // Start all tracking (called after consent is confirmed or when consent is not required)
  function startTracking() {
    setupEventListeners();
    startHeartbeat();
    state.durationConversionInterval = setInterval(checkDurationConversion, 30000);

    trackSession().then(function() {
      return trackPageView();
    }).then(function() {
      setTimeout(function() { checkPageConversion(); }, 1000);
    }).catch(function(error) {
      console.warn('Analytics tracking error:', error);
    });
  }

  // Check if tracking is allowed based on consent
  function isTrackingAllowed() {
    if (!state.cookieConsent || !state.cookieConsent.enabled) return true;
    if (!state.consentGiven) return false;
    return !!state.consentGiven.analytics;
  }

  // Save consent to localStorage
  function saveConsent(categories) {
    state.consentGiven = categories;
    try {
      localStorage.setItem('analytics_consent', JSON.stringify(categories));
    } catch (e) { /* ignore */ }
  }

  // ─── Analytics Consent Banner (Shadow DOM) ───

  // Escape HTML to prevent XSS in consent banner
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showConsentBanner() {
    if (!state.cookieConsent || !state.cookieConsent.enabled) return;
    if (state.consentGiven) return;

    var cc = state.cookieConsent;
    var host = document.createElement('div');
    host.id = 'analytics-consent-host';
    var shadow = host.attachShadow({ mode: 'open' });

    var isDark = cc.theme === 'dark' || (cc.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    // Glassmorphism palette
    var fg = isDark ? '#f0f0f0' : '#111';
    var muted = isDark ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.45)';
    var borderC = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
    var accent = isDark ? '#60a5fa' : '#2563eb';

    // Position
    var isCard = cc.position === 'bottom-left' || cc.position === 'bottom-right';
    var posStyles = '';
    if (cc.position === 'top') {
      posStyles = 'top:16px;left:16px;right:16px;border-radius:14px;';
    } else if (cc.position === 'bottom-left') {
      posStyles = 'bottom:20px;left:20px;max-width:340px;border-radius:16px;';
    } else if (cc.position === 'bottom-right') {
      posStyles = 'bottom:20px;right:20px;max-width:340px;border-radius:16px;';
    } else {
      posStyles = 'bottom:16px;left:16px;right:16px;border-radius:14px;';
    }

    // Category pills
    var catHtml = '';
    if (cc.categories) {
      catHtml = '<div class="cc-cats">';
      catHtml += '<label class="cc-cat cc-cat-off"><input type="checkbox" checked disabled> Necessary</label>';
      if (cc.categories.analytics) catHtml += '<label class="cc-cat"><input type="checkbox" data-cat="analytics" checked> Analytics</label>';
      if (cc.categories.marketing) catHtml += '<label class="cc-cat"><input type="checkbox" data-cat="marketing"> Marketing</label>';
      if (cc.categories.preferences) catHtml += '<label class="cc-cat"><input type="checkbox" data-cat="preferences"> Preferences</label>';
      catHtml += '</div>';
    }

    var policyLink = '';
    if (cc.privacyPolicyUrl) {
      // Only allow http/https URLs to prevent javascript: XSS
      try {
        var policyUrl = new URL(cc.privacyPolicyUrl);
        if (policyUrl.protocol === 'https:' || policyUrl.protocol === 'http:') {
          policyLink = ' <a class="cc-link" href="' + escapeHtml(cc.privacyPolicyUrl) + '" target="_blank" rel="noopener">Privacy Policy</a>';
        }
      } catch (e) { /* invalid URL, skip */ }
    }

    var cardBg = isDark ? 'rgba(24,24,27,.82)' : 'rgba(255,255,255,.82)';
    var footerBg = isDark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.02)';
    var secondaryBg = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)';
    var secondaryHover = isDark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.08)';

    shadow.innerHTML = '<style>'
      + '*{box-sizing:border-box;margin:0;padding:0}'
      // Wrapper — positions the card
      + '.cc-wrap{position:fixed;z-index:2147483647;' + posStyles + 'animation:cc-in .5s cubic-bezier(.22,1,.36,1)}'
      // Card — matches the shadcn Card component
      + '.cc{background:' + cardBg + ';-webkit-backdrop-filter:saturate(180%) blur(24px);backdrop-filter:saturate(180%) blur(24px);border:1px solid ' + borderC + ';border-radius:' + (isCard ? '16px' : '12px') + ';box-shadow:0 8px 40px rgba(0,0,0,' + (isDark ? '.5' : '.1') + ');font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:' + fg + ';overflow:hidden;' + (isCard ? 'margin:12px;' : '') + '}'
      // Header
      + '.cc-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 6px}'
      + '.cc-title{font-size:14px;font-weight:600;letter-spacing:-.01em}'
      + '.cc-icon{width:16px;height:16px;color:' + muted + '}'
      // Content
      + '.cc-content{padding:4px 20px 14px}'
      + '.cc-desc{font-size:12px;color:' + muted + ';line-height:1.55}'
      + '.cc-hint{font-size:11px;color:' + muted + ';margin-top:8px}'
      + '.cc-hint b{font-weight:500}'
      + '.cc-link{color:' + accent + ';text-decoration:none;font-size:12px;font-weight:500}'
      + '.cc-link:hover{text-decoration:underline}'
      // Categories
      + '.cc-cats{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}'
      + '.cc-cat{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;background:' + secondaryBg + ';color:' + fg + ';cursor:pointer;transition:background .15s;border:1px solid transparent;user-select:none}'
      + '.cc-cat:hover{background:' + secondaryHover + '}'
      + '.cc-cat:has(input:checked){border-color:' + accent + '30}'
      + '.cc-cat input{width:12px;height:12px;accent-color:' + accent + ';margin:0;cursor:pointer}'
      + '.cc-cat-off{color:' + muted + ';cursor:default}'
      + '.cc-cat-off:hover{background:' + secondaryBg + '}'
      + '.cc-cat-off input{opacity:.35}'
      // Footer
      + '.cc-footer{display:flex;gap:8px;padding:12px 20px;border-top:1px solid ' + borderC + ';background:' + footerBg + ';justify-content:flex-end}'
      + '.cc-btn{padding:7px 16px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;border:none;transition:all .15s;text-align:center}'
      + '.cc-accept{background:' + accent + ';color:#fff}'
      + '.cc-accept:hover{filter:brightness(1.1)}'
      + '.cc-reject{background:' + secondaryBg + ';color:' + fg + '}'
      + '.cc-reject:hover{background:' + secondaryHover + '}'
      + '@keyframes cc-in{from{opacity:0;transform:translateY(' + (cc.position === 'top' ? '-12' : '12') + 'px)}to{opacity:1;transform:translateY(0)}}'
      + '</style>'
      + '<div class="cc-wrap"><div class="cc">'
      // Header
      + '<div class="cc-header">'
      + '<div class="cc-title">Analytics Consent</div>'
      + '</div>'
      // Content
      + '<div class="cc-content">'
      + '<div class="cc-desc">' + escapeHtml(cc.message || 'We use analytics to understand site usage and improve your experience.') + '</div>'
      + (policyLink ? '<div style="margin-top:8px">' + policyLink + '</div>' : '')
      + catHtml
      + '</div>'
      // Footer
      + '<div class="cc-footer">'
      + '<button class="cc-btn cc-reject" id="cc-reject">' + escapeHtml(cc.rejectText || 'Decline') + '</button>'
      + '<button class="cc-btn cc-accept" id="cc-accept">' + escapeHtml(cc.acceptText || 'Accept') + '</button>'
      + '</div>'
      + '</div></div>';

    function getCategories(allAccepted) {
      var cats = { necessary: true, analytics: false, marketing: false, preferences: false };
      if (allAccepted) {
        if (cc.categories.analytics) cats.analytics = true;
        if (cc.categories.marketing) cats.marketing = true;
        if (cc.categories.preferences) cats.preferences = true;
      }
      // Reject = all optional categories forced to false (default cats value)
      return cats;
    }

    function dismiss(categories) {
      saveConsent(categories);
      var el = shadow.querySelector('.cc-wrap');
      if (el) {
        el.style.transition = 'opacity .3s ease,transform .3s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(12px)';
        setTimeout(function() { host.remove(); }, 350);
      }
      if (categories.analytics && state.isInitialized) {
        startTracking();
      }
    }

    shadow.getElementById('cc-accept').addEventListener('click', function() {
      dismiss(getCategories(true));
    });

    shadow.getElementById('cc-reject').addEventListener('click', function() {
      dismiss(getCategories(false));
    });

    document.body.appendChild(host);
  }

  function init(trackingCode, options = {}) {
    if (state.isInitialized) return;

    CONFIG.TRACKING_CODE = trackingCode;

    if (!trackingCode) {
      console.warn('Analytics: No tracking code provided');
      return;
    }

    // Set API base URL - use provided option or try to detect from script source
    if (options.apiBase) {
      CONFIG.API_BASE = options.apiBase;
    } else {
      // Try to detect from script source
      const script = document.currentScript || document.querySelector('script[src*="analytics.js"]');
      if (script && script.src) {
        try {
          const url = new URL(script.src);
          CONFIG.API_BASE = url.origin;
        } catch (e) {
          CONFIG.API_BASE = window.location.origin;
        }
      } else {
        CONFIG.API_BASE = window.location.origin;
      }
    }

    // Initialize state
    state.visitorId = getVisitorId();
    const sessionData = getSessionId();
    state.sessionId = sessionData.sessionId;
    state.sessionStart = sessionData.sessionStart;
    state.currentPath = window.location.pathname;
    state.isInitialized = true;

    // Track initial session and page view (in sequence to ensure proper order)
    (async () => {
      try {
        // Load website config (excluded paths + analytics consent)
        var siteActive = await loadWebsiteConfig();
        if (!siteActive) return; // Site inactive or not found — don't track

        // If consent required and not given, show banner and wait
        if (state.cookieConsent && state.cookieConsent.enabled && !state.consentGiven) {
          showConsentBanner();
          return; // Don't track or set up listeners until consent is given
        }

        // If consent required but analytics rejected, don't track
        if (!isTrackingAllowed()) return;

        startTracking();
      } catch (error) {
        console.warn('Analytics initialization error:', error);
      }
    })();
  }

  // Track conversion
  function trackConversion(goalData = {}) {
    if (!state.isInitialized || !isTrackingAllowed()) return;

    const data = {
      trackingCode: CONFIG.TRACKING_CODE,
      visitorId: state.visitorId,
      sessionId: state.sessionId,
      page: window.location.pathname,
      eventName: goalData.eventName || null,
      duration: goalData.duration || null,
      value: goalData.value || null,
      metadata: goalData.metadata || {},
      timestamp: new Date().toISOString(),
    };

    fetch(`${CONFIG.API_BASE}/api/track/conversion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true,
    }).catch(() => { });
  }

  // Check for pageview conversions (called on page load/change)
  function checkPageConversion() {
    trackConversion({
      page: window.location.pathname,
    });
  }

  // Check for duration conversions
  function checkDurationConversion() {
    if (state.pageStartTime) {
      const duration = Math.floor((Date.now() - state.pageStartTime) / 1000);
      trackConversion({
        duration: duration,
      });
    }
  }

  // Public API
  window.analytics = {
    init: init,
    track: trackEvent,
    page: trackPageView,
    identify: function (userId, traits) {
      trackEvent('identify', 'user_identified', Object.assign({ userId: userId }, traits || {}));
    },
    conversion: trackConversion,
    goal: function (goalName, value) {
      trackConversion({ eventName: goalName, value: value });
    },
    consent: function () {
      return state.consentGiven;
    },
    resetConsent: function () {
      state.consentGiven = null;
      try { localStorage.removeItem('analytics_consent'); } catch (e) { /* ignore */ }
      showConsentBanner();
    },
  };

  // Auto-initialize if data-tracking-code is present
  const script = document.currentScript || document.querySelector('script[data-tracking-code]');
  if (script && script.dataset.trackingCode) {
    window.analytics.init(script.dataset.trackingCode);
  }
})();
