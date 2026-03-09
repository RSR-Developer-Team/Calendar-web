const fs = require('fs');

async function discover() {
    const config = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));
    const baseUrl = config.emperorServerUrl.replace(/\/+$/, '');
    const champId = config.championshipId;

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const endpoints = [
        'entries.json',
        'entrants.json',
        'entrylist.json',
        'registrations.json',
        'participants.json',
        'drivers.json',
        'users.json',
        'entry-list.json',
        'entrant-list.json'
    ];

    for (const ep of endpoints) {
        const url1 = `${baseUrl}/api/championship/${champId}/${ep}`;
        const url2 = `${baseUrl}/api/championships/${champId}/${ep}`;

        for (const url of [url1, url2]) {
            console.log("Checking:", url);
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    console.log("FOUND!", url);
                    fs.writeFileSync(`found_${ep}`, JSON.stringify(data, null, 2));
                    return;
                }
            } catch (e) { }
        }
    }
    console.log("None of the guessed endpoints worked.");
}
discover();
