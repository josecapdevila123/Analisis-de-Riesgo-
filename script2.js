import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Selector 1: 
// h1 font-serif -> font-sans
code = code.replace(/text-2xl font-serif font-bold uppercase mb-2 relative z-10/g, 'text-2xl font-sans font-bold uppercase mb-2 relative z-10');

// Selector 2:
// font-serif italic text-lg -> font-sans font-bold text-lg
code = code.replace(/font-serif italic text-lg/g, 'font-sans font-bold text-lg');

// Selector 4:
// italic opacity-80 -> italic text-[#000000] opacity-100
code = code.replace(/italic opacity-80/g, 'italic text-[#000000] opacity-100');

// Selector 6 & 8:
// text-xs font-bold uppercase tracking-wider inside spans that are headers of details
code = code.replace(/<span className="text-xs font-bold uppercase tracking-wider">/g, '<span className="text-lg font-bold uppercase tracking-wider">');

fs.writeFileSync('src/App.tsx', code);
