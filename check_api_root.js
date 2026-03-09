const fs = require('fs');

async function checkApiRoot() {
    const config = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));
    const baseUrl = config.emperorServerUrl.replace(/\/+$/, '');

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
        const res = await fetch(`${baseUrl}/api/`);
        if (!res.ok) { console.log("API root not found"); return; }
        const data = await res.json();
        console.log("API Root Keys:", data);
    } catch (e) {
        console.log("Error:", e.message);
    }
}
checkApiRoot();
