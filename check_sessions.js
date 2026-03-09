const fs = require('fs');

async function checkSessions() {
    const config = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));
    const baseUrl = config.emperorServerUrl.replace(/\/+$/, '');
    const champId = config.championshipId;

    let logOutput = "";
    const log = (msg) => { logOutput += msg + "\n"; console.log(msg); };

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const urls = [
        `${baseUrl}/api/championship/${champId}/sessions.json`,
        `${baseUrl}/api/championship/${champId}/detail.json`
    ];

    for (const url of urls) {
        log("Checking: " + url);
        try {
            const res = await fetch(url);
            if (!res.ok) { log("Not found: " + url); continue; }
            const data = await res.json();
            log("Keys: " + JSON.stringify(Object.keys(data)));
            if (data.Drivers) log("Drivers length: " + data.Drivers.length);
            if (data.Entrants) log("Entrants length: " + data.Entrants.length);
            if (data.Entries) log("Entries length: " + data.Entries.length);
            if (data.Sessions) log("Sessions length: " + data.Sessions.length);
        } catch (e) {
            log("Error: " + e.message);
        }
    }
    fs.writeFileSync('sessions_output.txt', logOutput);
}
checkSessions();
