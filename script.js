import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/text-xs font-bold uppercase tracking-widest mb-4 opacity-70 text-\[\#141414\]/g, 'text-base font-bold uppercase tracking-widest mb-4 opacity-70 text-[#141414]');
code = code.replace(/text-\[10px\] uppercase opacity-50 mb-1 text-\[\#141414\]/g, 'text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]');
fs.writeFileSync('src/App.tsx', code);
