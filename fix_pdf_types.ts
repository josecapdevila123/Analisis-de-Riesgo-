import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/r\.interpretation/g, 'r.description || ""');
content = content.replace(/nosis\.peor_situacion_bcra/g, 'nosis.situacion_bcra_peor_estado');
content = content.replace(/nosis\.total_deuda_sistema/g, 'nosis.deuda_financiera_total_nosis');

fs.writeFileSync('src/App.tsx', content);
console.log("Fixed PDF types");
