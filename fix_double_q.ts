import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/\?\?\./g, '?.');

fs.writeFileSync('src/App.tsx', content);
console.log("Fixed double question marks");
