const fs = require('fs');

const html = fs.readFileSync('g:/Proyingel/Repos/RSR/champ_page.html', 'utf8');

// Find the entrants tab content
const entrantsSection = html.match(/id="entrants"[\s\S]*?<\/tbody>/);
if (!entrantsSection) {
    console.log("Could not find entrants section");
    process.exit(1);
}

const section = entrantsSection[0];
const rows = section.match(/<tr[\s\S]*?<\/tr>/g);

const entrants = [];
if (rows) {
    rows.forEach(row => {
        const cols = row.match(/<td>([\s\S]*?)<\/td>/g);
        if (cols && cols.length >= 3) {
            const name = cols[1].replace(/<[\s\S]*?>/g, '').trim();
            const team = cols[2].replace(/<[\s\S]*?>/g, '').trim();
            entrants.push({ name, team });
        }
    });
}

console.log("Found", entrants.length, "entrants:");
console.log(JSON.stringify(entrants.slice(0, 5), null, 2));

// Check for a specific 0-point driver
const missing = entrants.find(e => e.name === "Francis Fernandez");
console.log("Francis Fernandez found:", !!missing);
