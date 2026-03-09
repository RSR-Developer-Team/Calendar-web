const fs = require('fs');

async function discover() {
    const config = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));
    const baseUrl = config.emperorServerUrl.replace(/\/+$/, '');
    const champId = config.championshipId;

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const urls = [
        `${baseUrl}/api/championships/${champId}/standings.json`,
        `${baseUrl}/api/championships/${champId}/entrants.json`,
        `${baseUrl}/api/championships/${champId}/entries.json`,
        `${baseUrl}/api/championships/${champId}/entrylist.json`,
        `${baseUrl}/api/championships/${champId}/details.json`
    ];

    for (const url of urls) {
        console.log("Checking:", url);
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                console.log("FOUND!", url, "Keys:", Object.keys(data));
                return;
            } else {
                console.log("Status:", res.status, "for", url);
            }
        } catch (e) {
            console.log("Error:", e.message);
        }
    }
}
discover();
