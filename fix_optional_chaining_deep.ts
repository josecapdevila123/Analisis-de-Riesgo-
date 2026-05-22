import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/\.ejercicio_actual\./g, '?.ejercicio_actual?.');
content = content.replace(/\.ejercicio_anterior\./g, '?.ejercicio_anterior?.');
content = content.replace(/\.activo\./g, '?.activo?.');
content = content.replace(/\.pasivo\./g, '?.pasivo?.');
content = content.replace(/\.activo_corriente/g, '?.activo_corriente');
content = content.replace(/\.activo_no_corriente/g, '?.activo_no_corriente');
content = content.replace(/\.pasivo_corriente/g, '?.pasivo_corriente');
content = content.replace(/\.pasivo_no_corriente/g, '?.pasivo_no_corriente');
content = content.replace(/\.total_del_activo/g, '?.total_del_activo');
content = content.replace(/\.total_del_pasivo/g, '?.total_del_pasivo');
content = content.replace(/\.patrimonio_neto_total/g, '?.patrimonio_neto_total');
content = content.replace(/\.resultado_del_ejercicio_final/g, '?.resultado_del_ejercicio_final');

// Fix any double optional chaining that might have been created
content = content.replace(/\?\.\?\./g, '?.');

fs.writeFileSync('src/App.tsx', content);
console.log("Fixed deep optional chaining");
