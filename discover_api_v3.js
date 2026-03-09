const fs = require('fs');

async function discover() {
    const config = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));
    const baseUrl = config.emperorServerUrl.replace(/\/+$/, '');
    const champId = config.championshipId;

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const endpoints = [
        `championship/${champId}/entrants.json`,
        `championship/${champId}/entries.json`,
        `championship/${champId}/export/json`,
        `championship/${champId}/export/csv`
    ];

    for (const ep of endpoints) {
        const url = `${baseUrl}/${ep}`;
        console.log("Checking:", url);
        try {
            const res = await fetch(url);
            if (res.ok) {
                console.log("FOUND!", url, "Status:", res.status);
                const text = await res.text();
                fs.writeFileSync(`found_${ep.replace(/\//g, '_')}`, text);
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
