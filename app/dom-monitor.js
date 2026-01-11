/**
 * DOM Monitor Script
 * This script is injected into pages to monitor DOM changes made by extensions
 */

(function () {
    // Prevent double injection
    if (window.__CHROME_MONITOR_DOM__) return;
    window.__CHROME_MONITOR_DOM__ = true;

    const events = [];
    const startTime = Date.now();

    // Send event to parent
    function reportEvent(type, data) {
        const event = {
            timestamp: new Date().toISOString(),
            type: type,
            url: window.location.href,
            ...data
        };
        events.push(event);

        // Try to send via exposed Puppeteer function first
        if (typeof window.__chromemonitor_dom_event__ === 'function') {
            try {
                window.__chromemonitor_dom_event__(event);
                return;
            } catch (e) { }
        }

        // Fallback: Send via postMessage
        window.postMessage({
            source: 'chrome-monitor-dom',
            event: event
        }, '*');
    }

    // ========== MUTATION OBSERVER ==========
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            // New nodes added
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;

                    // Script injection
                    if (node.tagName === 'SCRIPT') {
                        reportEvent('script_injected', {
                            severity: 'critical',
                            src: node.src || '[inline]',
                            content: node.src ? null : (node.textContent || '').substring(0, 500)
                        });
                    }

                    // iFrame injection
                    if (node.tagName === 'IFRAME') {
                        reportEvent('iframe_injected', {
                            severity: 'high',
                            src: node.src,
                            hidden: node.style.display === 'none' ||
                                node.style.visibility === 'hidden' ||
                                node.width === '0' || node.height === '0'
                        });
                    }

                    // Form injection
                    if (node.tagName === 'FORM') {
                        reportEvent('form_injected', {
                            severity: 'high',
                            action: node.action,
                            method: node.method,
                            hasPasswordField: !!node.querySelector('input[type="password"]')
                        });
                    }

                    // Input injection (potential keylogger)
                    if (node.tagName === 'INPUT') {
                        reportEvent('input_injected', {
                            severity: 'medium',
                            type: node.type,
                            name: node.name
                        });
                    }

                    // Link injection
                    if (node.tagName === 'A' && node.href) {
                        // Only report external links
                        try {
                            const linkDomain = new URL(node.href).hostname;
                            const pageDomain = window.location.hostname;
                            if (linkDomain !== pageDomain) {
                                reportEvent('link_injected', {
                                    severity: 'low',
                                    href: node.href,
                                    text: node.textContent?.substring(0, 100)
                                });
                            }
                        } catch (e) { }
                    }

                    // Check for hidden malicious elements
                    if (node.style && (
                        node.style.position === 'fixed' ||
                        node.style.position === 'absolute'
                    )) {
                        const rect = node.getBoundingClientRect?.();
                        if (rect && (rect.width > 300 || rect.height > 300)) {
                            reportEvent('overlay_detected', {
                                severity: 'high',
                                tagName: node.tagName,
                                size: `${rect.width}x${rect.height}`
                            });
                        }
                    }

                    // Recursively check children
                    if (node.querySelectorAll) {
                        node.querySelectorAll('script').forEach(s => {
                            reportEvent('script_injected', {
                                severity: 'critical',
                                src: s.src || '[inline]',
                                content: s.src ? null : (s.textContent || '').substring(0, 500)
                            });
                        });

                        node.querySelectorAll('iframe').forEach(f => {
                            reportEvent('iframe_injected', {
                                severity: 'high',
                                src: f.src,
                                hidden: f.style.display === 'none'
                            });
                        });
                    }
                });
            }

            // Attribute changes
            if (mutation.type === 'attributes') {
                const node = mutation.target;
                const attr = mutation.attributeName;

                // Form action changed (phishing)
                if (node.tagName === 'FORM' && attr === 'action') {
                    reportEvent('form_action_changed', {
                        severity: 'critical',
                        oldValue: mutation.oldValue,
                        newValue: node.action
                    });
                }

                // Link href changed (redirect hijacking)
                if (node.tagName === 'A' && attr === 'href') {
                    reportEvent('link_href_changed', {
                        severity: 'medium',
                        oldValue: mutation.oldValue,
                        newValue: node.href
                    });
                }

                // Script src changed
                if (node.tagName === 'SCRIPT' && attr === 'src') {
                    reportEvent('script_src_changed', {
                        severity: 'critical',
                        oldValue: mutation.oldValue,
                        newValue: node.src
                    });
                }
            }
        });
    });

    // Start observing
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['href', 'src', 'action', 'onclick', 'onsubmit']
    });

    // ========== EVENT LISTENER MONITORING ==========
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        // Monitor sensitive event listeners
        if (['keydown', 'keyup', 'keypress', 'input', 'change'].includes(type)) {
            if (this.tagName === 'INPUT' || this.tagName === 'TEXTAREA' || this === document || this === window) {
                reportEvent('keylogger_suspect', {
                    severity: 'critical',
                    eventType: type,
                    targetTag: this.tagName || 'window/document',
                    targetType: this.type || null
                });
            }
        }

        // Form submit listeners
        if (type === 'submit' && this.tagName === 'FORM') {
            reportEvent('form_submit_listener', {
                severity: 'high',
                formAction: this.action
            });
        }

        // Clipboard access
        if (['copy', 'paste', 'cut'].includes(type)) {
            reportEvent('clipboard_listener', {
                severity: 'high',
                eventType: type
            });
        }

        return originalAddEventListener.call(this, type, listener, options);
    };

    // ========== FORM SUBMISSION MONITORING ==========
    document.addEventListener('submit', function (e) {
        const form = e.target;
        if (form.tagName !== 'FORM') return;

        // Collect form data (without actual values)
        const fields = [];
        form.querySelectorAll('input, select, textarea').forEach(input => {
            fields.push({
                name: input.name,
                type: input.type,
                hasValue: !!input.value
            });
        });

        reportEvent('form_submitted', {
            severity: 'medium',
            action: form.action,
            method: form.method,
            fields: fields,
            hasPasswordField: fields.some(f => f.type === 'password')
        });
    }, true);

    // ========== XHR/FETCH MONITORING ==========
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
        const url = args[0]?.url || args[0];
        const options = args[1] || {};

        reportEvent('fetch_request', {
            severity: 'low',
            url: url?.toString?.() || url,
            method: options.method || 'GET',
            hasBody: !!options.body
        });

        return originalFetch.apply(this, args);
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        this._monitorUrl = url;
        this._monitorMethod = method;
        return originalXHROpen.apply(this, arguments);
    };

    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
        reportEvent('xhr_request', {
            severity: 'low',
            url: this._monitorUrl,
            method: this._monitorMethod,
            hasBody: !!body
        });
        return originalXHRSend.apply(this, arguments);
    };

    // ========== COOKIE ACCESS MONITORING ==========
    let cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (cookieDescriptor) {
        Object.defineProperty(document, 'cookie', {
            get: function () {
                reportEvent('cookie_read', {
                    severity: 'high'
                });
                return cookieDescriptor.get.call(document);
            },
            set: function (val) {
                reportEvent('cookie_write', {
                    severity: 'high',
                    value: val.substring(0, 100)
                });
                return cookieDescriptor.set.call(document, val);
            }
        });
    }

    // ========== LOCAL/SESSION STORAGE MONITORING ==========
    ['localStorage', 'sessionStorage'].forEach(storageName => {
        const storage = window[storageName];
        if (!storage) return;

        const originalSetItem = storage.setItem.bind(storage);
        storage.setItem = function (key, value) {
            reportEvent('storage_write', {
                severity: 'medium',
                storage: storageName,
                key: key,
                valueLength: value?.length || 0
            });
            return originalSetItem(key, value);
        };

        const originalGetItem = storage.getItem.bind(storage);
        storage.getItem = function (key) {
            reportEvent('storage_read', {
                severity: 'low',
                storage: storageName,
                key: key
            });
            return originalGetItem(key);
        };
    });

    // Log that monitoring started
    reportEvent('monitor_started', {
        severity: 'info',
        message: 'DOM monitoring active'
    });

    console.log('[Chrome Monitor] DOM monitoring active');
})();
