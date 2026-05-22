import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/activeResult\.data\?\.hoja_estado_situacion_patrimonial\./g, 'activeResult.data?.hoja_estado_situacion_patrimonial?.');
content = content.replace(/activeResult\.data\?\.hoja_estado_resultados\./g, 'activeResult.data?.hoja_estado_resultados?.');
content = content.replace(/activeResult\.data\?\.analisis_post_cierre\./g, 'activeResult.data?.analisis_post_cierre?.');
content = content.replace(/activeResult\.dashboardData\.company_profile\./g, 'activeResult.dashboardData?.company_profile?.');
content = content.replace(/activeResult\.dashboardData\.extraccion_nosis\./g, 'activeResult.dashboardData?.extraccion_nosis?.');
content = content.replace(/activeResult\.dashboardData\.cross_check\./g, 'activeResult.dashboardData?.cross_check?.');
content = content.replace(/activeResult\.dashboardData\.sales_analysis\./g, 'activeResult.dashboardData?.sales_analysis?.');
content = content.replace(/activeResult\.dashboardData\.ratios\./g, 'activeResult.dashboardData?.ratios?.');
content = content.replace(/activeResult\.dashboardData\.motor_de_ratios\./g, 'activeResult.dashboardData?.motor_de_ratios?.');

fs.writeFileSync('src/App.tsx', content);
console.log("Fixed optional chaining");
