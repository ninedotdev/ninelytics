(function () {
  'use strict';

  var siteId = window.__SI_SITE;
  var endpoint = window.__SI_EP;

  if (!siteId || !endpoint) return;

  // Google Core Web Vitals thresholds
  var THRESHOLDS = {
    LCP:  { good: 2500,  poor: 4000  },
    FCP:  { good: 1800,  poor: 3000  },
    INP:  { good: 200,   poor: 500   },
    CLS:  { good: 0.1,   poor: 0.25  },
    TTFB: { good: 800,   poor: 1800  },
  };

  function getRating(name, value) {
    var t = THRESHOLDS[name];
    if (!t) return 'unknown';
    if (value <= t.good) return 'good';
    if (value <= t.poor) return 'needs-improvement';
    return 'poor';
  }

  function getDeviceType() {
    var ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua)) return 'mobile';
    if (/Tablet|iPad/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  function getConnectionType() {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return (conn && conn.effectiveType) || 'unknown';
  }

  function sendVital(name, value) {
    // CLS stored as integer (multiply by 1000 to avoid float precision issues)
    var storedValue = Math.round(name === 'CLS' ? value * 1000 : value);
    var payload = JSON.stringify({
      siteId: siteId,
      name: name,
      value: storedValue,
      rating: getRating(name, value),
      path: location.pathname,
      deviceType: getDeviceType(),
      connectionType: getConnectionType(),
    });

    // Send as text/plain to avoid CORS preflight (simple request, no credentials issue)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint + '/api/vitals', payload);
    } else {
      fetch(endpoint + '/api/vitals', {
        method: 'POST',
        body: payload,
        keepalive: true,
        credentials: 'omit',
      }).catch(function () {});
    }
  }

  // LCP — Largest Contentful Paint
  try {
    new PerformanceObserver(function (list) {
      var entry = list.getEntries().pop();
      if (entry) sendVital('LCP', entry.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}

  // FCP — First Contentful Paint
  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name === 'first-contentful-paint') {
          sendVital('FCP', entries[i].startTime);
          break;
        }
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}

  // INP — Interaction to Next Paint
  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      var worst = 0;
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].duration > worst) worst = entries[i].duration;
      }
      if (worst > 0) sendVital('INP', worst);
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch (e) {}

  // CLS — Cumulative Layout Shift (sent on page hide for accuracy)
  try {
    var clsValue = 0;
    var clsObs = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].hadRecentInput) clsValue += entries[i].value;
      }
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        try { clsObs.takeRecords(); } catch (e) {}
        if (clsValue > 0) sendVital('CLS', clsValue);
      }
    });
  } catch (e) {}

  // TTFB — Time to First Byte
  try {
    var navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0) {
      var nav = navEntries[0];
      sendVital('TTFB', nav.responseStart - nav.requestStart);
    }
  } catch (e) {}

})();
