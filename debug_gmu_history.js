
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('remote_history.json', 'utf8'));

console.log('Total professors:', Object.keys(data).length);

let gmuSegments = [];
let allSegments = 0;

for (const [prof, segments] of Object.entries(data)) {
    for (const seg of segments) {
        allSegments++;
        if (seg.school === 'George Mason University') {
            gmuSegments.push({ prof, ...seg });
        }
    }
}

console.log('Total segments:', allSegments);
console.log('GMU segments:', gmuSegments.length);

if (gmuSegments.length > 0) {
    // Sort by start year
    gmuSegments.sort((a, b) => a.start - b.start);

    console.log('\nEarliest 20 GMU segments:');
    gmuSegments.slice(0, 20).forEach(s => {
        console.log(`${s.prof}: ${s.start}-${s.end}`);
    });

    const startYears = gmuSegments.map(s => s.start);
    const minStart = Math.min(...startYears);
    console.log('\nGlobal Earliest GMU Start Year:', minStart);
} else {
    console.log('No GMU segments found.');
}
