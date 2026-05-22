import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');

const startIndex = content.indexOf("{activeResult?.status === 'completed' && activeResult.dashboardData && (");
const endIndex = content.indexOf("</div>\n              )}", startIndex) + 24;

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find the block to replace.");
  process.exit(1);
}

const block = content.substring(startIndex, endIndex);

const extractSection = (startMarker: string, endMarker: string) => {
  const start = block.indexOf(startMarker);
  if (start === -1) return null;
  const end = endMarker ? block.indexOf(endMarker, start) : block.length;
  return block.substring(start, end);
};

const institutionalHeader = extractSection("{/* Institutional Header */}", "{activeTab === 'Balance y Ratios'");

// Extract Balance y Ratios parts
const patrimonialSummary = extractSection("{/* Patrimonial Summary Table", "{/* Collapsible Historical Analysis");
const historicalAnalysis = extractSection("{/* Collapsible Historical Analysis", "{/* Profitability Analysis Module");
const profitabilityModule = extractSection("{/* Profitability Analysis Module", "{activeTab === 'Información post balance'");

const postClosingSection = extractSection("{/* Post-Closing Analysis Section", "{activeTab === 'Resumen Ejecutivo'");

const kpiCards = extractSection("{/* KPI Cards", "{/* Motor de Ratios Section");
const motorDeRatios = extractSection("{/* Motor de Ratios Section", "{/* Informe Markdown Section");
const informeMarkdown = extractSection("{/* Informe Markdown Section", "{/* Nosis Section");
const nosisSection = extractSection("{/* Nosis Section", "{/* Cross Check Section");
const crossCheckSection = extractSection("{/* Cross Check Section", "{/* Sales Analysis");
const salesAnalysisSection = extractSection("{/* Sales Analysis", "{/* Report Generation Button");
const reportGeneration = extractSection("{/* Report Generation Button", "{/* Collapsible JSON Data");
const collapsibleJson = extractSection("{/* Collapsible JSON Data", "</div>\n              )}");

const newBlock = `{activeResult?.status === 'completed' && activeResult.dashboardData && (
                <div className="flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {/* Sidebar */}
                  <div className="w-full md:w-64 shrink-0 flex flex-col gap-2">
                    {TABS.map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "text-left px-4 py-3 text-sm font-medium transition-colors border-l-2",
                          activeTab === tab 
                            ? "border-[#141414] bg-[#141414]/5 text-[#141414]" 
                            : "border-transparent text-[#141414]/60 hover:bg-[#141414]/5 hover:text-[#141414]"
                        )}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0 space-y-8">
                    
                    ${institutionalHeader}

                    {activeTab === 'Resumen Ejecutivo' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        ${kpiCards}
                        ${informeMarkdown}
                        ${reportGeneration}
                      </div>
                    )}

                    {activeTab === 'Balance y Ratios' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        ${patrimonialSummary}
                        ${historicalAnalysis}
                        ${profitabilityModule}
                        ${motorDeRatios}
                        ${collapsibleJson}
                      </div>
                    )}

                    {activeTab === 'Información post balance' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        ${postClosingSection}
                      </div>
                    )}

                    {activeTab === 'Proyecciones' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        ${salesAnalysisSection}
                      </div>
                    )}

                    {activeTab === 'Sistema Financiero (Nosis)' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        ${nosisSection}
                        ${crossCheckSection}
                      </div>
                    )}

                    {['Accionistas y Directorio', 'Historia y actividad de la empresa', 'Mercado', 'Opinión de riesgos'].includes(activeTab) && (
                      <div className="bg-white border border-[#141414] p-12 text-center text-[#141414]/60 font-mono text-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                        Contenido de {activeTab} en desarrollo
                      </div>
                    )}

                  </div>
                </div>
              )}`;

const newContent = content.substring(0, startIndex) + newBlock + content.substring(endIndex);
fs.writeFileSync('src/App.tsx', newContent);
console.log("Successfully rewritten dashboard layout.");
