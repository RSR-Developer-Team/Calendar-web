const fs = require('fs');

async function dump() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const url = "https://de5.assettohosting.com:50140/api/championship/7b6aaf22-64d2-4008-b718-b6cf2c54a6b7/standings.json";
    try {
        const res = await fetch(url);
        const data = await res.json();
        fs.writeFileSync('full_standings_raw.json', JSON.stringify(data, null, 2));
        console.log("Dumped to full_standings_raw.json");
    } catch (e) {
        console.error(e);
    }
}
dump();
