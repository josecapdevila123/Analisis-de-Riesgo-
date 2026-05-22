import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = content.split('\n');

const part1 = lines.slice(0, 662).join('\n');
const part2 = lines.slice(1502).join('\n');

fs.writeFileSync('src/App.tsx', part1 + '\n' + part2);
console.log("Fixed App.tsx");
