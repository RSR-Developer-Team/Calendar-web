const fs = require('fs');
const path = require('path');

async function inspect() {
    const config = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));
    const baseUrl = config.emperorServerUrl.replace(/\/+$/, '');
    const champId = config.championshipId;

    let logOutput = "";
    const log = (msg) => { logOutput += msg + "\n"; console.log(msg); };

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    // Try more specific endpoints
    const urls = [
        `${baseUrl}/api/championship/${champId}/entries.json`,
        `${baseUrl}/api/championship/${champId}/entrants.json`,
        `${baseUrl}/api/championship/${champId}/drivers.json`,
        `${baseUrl}/api/championship/${champId}/entrylist.json`
    ];

    for (const url of urls) {
        log("\n--- Testing: " + url + " ---");
        try {
            const res = await fetch(url);
            if (!res.ok) {
                log(`Failed (Status ${res.status}): ${url}`);
                continue;
            }
            const data = await res.json();
            log("Root Keys: " + JSON.stringify(Object.keys(data)));

            // If it's an array directly or has a main key
            if (Array.isArray(data)) {
                log(`FOUND ARRAY: length ${data.length}`);
                if (data.length > 0) log(`Sample entry: ` + JSON.stringify(data[0], null, 2));
            } else {
                // Check common keys
                const possibleKeys = ['Entries', 'Entrants', 'Drivers', 'Users', 'EntryList'];
                possibleKeys.forEach(k => {
                    if (data[k]) {
                        log(`FOUND KEY [${k}] in ${url}: ` + (Array.isArray(data[k]) ? `Array length ${data[k].length}` : 'Object'));
                        if (Array.isArray(data[k]) && data[k].length > 0) {
                            log(`Sample [${k}] entry: ` + JSON.stringify(data[k][0], null, 2));
                        }
                    }
                });
            }
        } catch (e) {
            log(`Error for ${url}: ` + e.message);
        }
    }

    fs.writeFileSync('api_output_full_v3.txt', logOutput);
}

inspect();
