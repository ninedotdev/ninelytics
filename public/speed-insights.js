(function () {
  'use strict';

  var siteId = window.__SI_SITE;
  var endpoint = window.__SI_EP;

  if (!siteId || !endpoint) return;

  var THRESHOLDS = {
    LCP:  { good: 2500,  poor: 4000  },
    FCP:  { good: 1800,  poor: 3000  },
    INP:  { good: 200,   poor: 500   },
    CLS:  { good: 0.1,   poor: 0.25  },
    TTFB: { good: 800,   poor: 1800  },
  };

  // Track which vitals have already been sent this page load — max 1 per metric
  var sent = {};

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
    // Only send once per metric per page load
    if (sent[name]) return;
    sent[name] = true;

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

  // LCP — take the LAST entry (final LCP candidate) on page hide
  var lcpValue = 0;
  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      if (entries.length > 0) lcpValue = entries[entries.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}

  // FCP — first paint only
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

  // INP — track worst interaction, send on page hide
  var inpValue = 0;
  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].duration > inpValue) inpValue = entries[i].duration;
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
  } catch (e) {}

  // CLS — accumulate, send on page hide
  var clsValue = 0;
  try {
    var clsObs = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].hadRecentInput) clsValue += entries[i].value;
      }
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}

  // TTFB — send immediately (only fires once)
  try {
    var navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0) {
      var nav = navEntries[0];
      var ttfb = nav.responseStart - nav.requestStart;
      if (ttfb > 0) sendVital('TTFB', ttfb);
    }
  } catch (e) {}

  // Send LCP, INP, CLS on page hide (most accurate moment)
  function onPageHide() {
    if (lcpValue > 0) sendVital('LCP', lcpValue);
    if (inpValue > 0) sendVital('INP', inpValue);
    if (clsValue > 0) sendVital('CLS', clsValue);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      try { if (typeof clsObs !== 'undefined') clsObs.takeRecords(); } catch (e) {}
      onPageHide();
    }
  });

  // Fallback for browsers that don't fire visibilitychange reliably
  window.addEventListener('pagehide', onPageHide);

})();
