import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Replace font-serif italic with font-sans font-bold in KPI titles
content = content.replace(/className="text-\[10px\] font-serif italic text-\[#141414\] uppercase mb-2"/g, 'className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2"');

// Replace font-mono with font-sans in KPI values
content = content.replace(/className="text-2xl font-bold font-mono mb-2 text-\[#141414\]"/g, 'className="text-2xl font-bold font-sans mb-2 text-[#141414]"');

// Replace opacity-60 leading-tight with font-sans font-bold opacity-60 leading-tight in subtitles
content = content.replace(/className="flex items-center text-\[10px\] opacity-60 leading-tight"/g, 'className="flex items-center text-[10px] font-sans font-bold opacity-60 leading-tight"');
content = content.replace(/className="text-\[10px\] opacity-60 leading-tight"/g, 'className="text-[10px] font-sans font-bold opacity-60 leading-tight"');

fs.writeFileSync('src/App.tsx', content);
console.log("Updated fonts to Poppins bold");
