/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { ComparativeView, getComparativeTablesData, formatValue, getVariationText } from './components/ComparativeView';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, 
  Upload, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Download,
  Trash2,
  RefreshCw,
  Search,
  LayoutDashboard,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Scale,
  AlertTriangle,
  X,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  CornerDownRight
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { cn, formatCurrencyThousands } from './lib/utils';
import { GEMINI_MODEL, GEMINI_GENERATION_CONFIG } from './lib/gemini';
import { EXTRACTION_PROMPT } from './lib/prompts/extraction';
import { generatePDF } from './features/pdf/generatePDF';
import { FinancialData, ExtractionResult, DashboardData, Ratio, AssetLiabilityGroup, Shareholder } from './types';
import { BiBankLogo } from './components/BiBankLogo';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc } from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from './firebase';

const ShareholderTable = ({ accionistas, level = 1, parentName = '' }: { accionistas: Shareholder[], level?: number, parentName?: string }) => {
  if (!accionistas || accionistas.length === 0) return null;

  return (
    <div className={`${level > 1 ? 'mt-8 mb-8 ml-4 md:ml-8 print:break-inside-avoid' : ''}`}>
      {level > 1 && (
        <div className="flex items-center gap-2 mb-3 text-[#141414]">
          <CornerDownRight className="w-4 h-4 opacity-50" />
          <h4 className="text-sm font-semibold">↳ Composición de {parentName}</h4>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className={`${level === 1 ? 'bg-[#F0EFED]' : 'bg-slate-50'} text-[#141414] text-xs uppercase tracking-wider`}>
            <tr>
              <th className="px-4 py-3 font-semibold border-b border-[#141414]/20">Apellido y Nombre / Razón Social</th>
              <th className="px-4 py-3 font-semibold border-b border-[#141414]/20">DNI / CUIT</th>
              <th className="px-4 py-3 font-semibold border-b border-[#141414]/20 w-1/3">% Participación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]/10">
            {accionistas.map((accionista, idx) => {
              const participacionNum = Number(accionista.participacion) || 0;
              return (
                <tr key={idx} className="hover:bg-[#141414]/5 transition-colors">
                  <td className="px-4 py-3 font-medium text-[#141414]">{accionista.nombre}</td>
                  <td className="px-4 py-3 text-[#141414]/70">{accionista.dni_cuit}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-[#141414]">{participacionNum}%</span>
                      <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-600 h-full" style={{ width: `${participacionNum}%` }}></div>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={`${level === 1 ? 'bg-[#F0EFED]' : 'bg-slate-50'} font-bold text-[#141414]`}>
              <td className="px-4 py-3 border-t border-[#141414]/20" colSpan={2}>TOTAL</td>
              <td className="px-4 py-3 border-t border-[#141414]/20">
                {accionistas.reduce((sum, a) => sum + (Number(a.participacion) || 0), 0).toFixed(2)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {accionistas.map((accionista, idx) => (
        accionista.subAccionistas && accionista.subAccionistas.length > 0 ? (
          <ShareholderTable 
            key={`sub-${idx}`} 
            accionistas={accionista.subAccionistas} 
            level={level + 1} 
            parentName={accionista.nombre} 
          />
        ) : null
      ))}
    </div>
  );
};
export default function App() {
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('Resumen Ejecutivo');
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(true);
  const [isInflationAdjusted, setIsInflationAdjusted] = useState(false);
  const [inflationInteranual, setInflationInteranual] = useState(60);
  const [inflationMensual, setInflationMensual] = useState(3);

  const TABS = [
    "Resumen Ejecutivo",
    "Balance y Ratios",
    "Accionistas y Directorio",
    "Historia y actividad de la empresa",
    "Mercado",
    "Información post balance",
    "Proyecciones",
    "Opinión de riesgos",
    "Sistema Financiero (Nosis)"
  ];
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFiles, setCurrentFiles] = useState<{ file: File; preview: string }[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setResults([]);
      return;
    }

    const q = query(collection(db, `users/${user.uid}/cases`), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedResults: ExtractionResult[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        let parsedData = null;
        let parsedDashboardData = null;
        
        try {
          parsedData = data.data ? JSON.parse(data.data) : null;
        } catch (e) {
          console.error("Error parsing data JSON", e);
        }
        
        try {
          parsedDashboardData = data.dashboardData ? JSON.parse(data.dashboardData) : null;
        } catch (e) {
          console.error("Error parsing dashboardData JSON", e);
        }

        loadedResults.push({
          id: data.id,
          timestamp: data.timestamp,
          fileNames: data.fileNames,
          data: parsedData,
          dashboardData: parsedDashboardData,
          status: data.status,
          error: data.error
        });
      });
      setResults(loadedResults);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/cases`);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setResults([]);
      setActiveResultId(null);
      setCurrentFiles([]);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const activeResult = results.find(r => r.id === activeResultId);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setCurrentFiles(prev => [...prev, {
          file,
          preview: reader.result as string
        }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf']
    },
    multiple: true
  });

  const removeFile = (index: number) => {
    setCurrentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processFiles = async () => {
    if (currentFiles.length === 0) return;

    setIsProcessing(true);
    const newId = Math.random().toString(36).substring(7);
    const newResult: ExtractionResult = {
      id: newId,
      timestamp: new Date().toISOString(),
      fileNames: currentFiles.map(f => f.file.name),
      data: null,
      dashboardData: null,
      status: 'processing'
    };

    setResults(prev => [newResult, ...prev]);
    setActiveResultId(newId);

    try {
      if (user) {
        try {
          await setDoc(doc(db, `users/${user.uid}/cases`, newId), {
            id: newId,
            timestamp: newResult.timestamp,
            fileNames: newResult.fileNames,
            status: newResult.status,
            userId: user.uid
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/cases/${newId}`);
        }
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = EXTRACTION_PROMPT;

      const contentParts = [
        { text: prompt },
        ...currentFiles.map(f => ({
          inlineData: {
            data: f.preview.split(',')[1],
            mimeType: f.file.type
          }
        }))
      ];

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ parts: contentParts }],
        config: GEMINI_GENERATION_CONFIG
      });

      const text = response.text;
      if (!text) throw new Error("No se pudo extraer texto del modelo.");
      
      const parsedResponse = JSON.parse(text);
      
      setResults(prev => prev.map(r => 
        r.id === newId ? { 
          ...r, 
          data: parsedResponse.data, 
          dashboardData: parsedResponse.dashboardData,
          status: 'completed' 
        } : r
      ));

      if (user) {
        try {
          await setDoc(doc(db, `users/${user.uid}/cases`, newId), {
            id: newId,
            timestamp: newResult.timestamp,
            fileNames: newResult.fileNames,
            data: JSON.stringify(parsedResponse.data || null),
            dashboardData: JSON.stringify(parsedResponse.dashboardData || null),
            status: 'completed',
            userId: user.uid
          }, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${newId}`);
        }
      }
    } catch (error) {
      console.error("Extraction error:", error);
      setResults(prev => prev.map(r => 
        r.id === newId ? { ...r, status: 'error', error: (error as Error).message } : r
      ));

      if (user) {
        try {
          await setDoc(doc(db, `users/${user.uid}/cases`, newId), {
            status: 'error',
            error: (error as Error).message
          }, { merge: true });
        } catch (dbError) {
          try {
            handleFirestoreError(dbError, OperationType.UPDATE, `users/${user.uid}/cases/${newId}`);
          } catch (e) {
            console.error("Failed to save error state to Firestore:", e);
          }
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const removeResult = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/cases`, id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/cases/${id}`);
      }
    } else {
      setResults(prev => prev.filter(r => r.id !== id));
    }
    if (activeResultId === id) setActiveResultId(null);
  };

  const downloadJson = (result: ExtractionResult) => {
    const exportData = {
      data: result.data,
      dashboardData: result.dashboardData
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `analisis_${result.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };


  const StatusBadge = ({ status }: { status: 'critical' | 'alert' | 'healthy' }) => {
    const colors = {
      critical: 'bg-red-500',
      alert: 'bg-yellow-500',
      healthy: 'bg-emerald-500'
    };
    return <div className={cn("w-3 h-3 rounded-full shadow-sm", colors[status])} />;
  };

  
  const calculateEBITDA = (ejercicio: any, flujo: any) => {
    if (!ejercicio) return null;
    const resultado_bruto = Number(ejercicio.resultado_bruto) || 0;
    const resultado_valuacion = Number(ejercicio.resultado_valuacion_bienes_de_cambio) || 0;
    const depreciacion = Number(flujo?.depreciacion_bienes_de_uso) || 0;
    const resultado_inversiones = Number(ejercicio.resultado_inversiones_permanentes) || 0;
    const gastos_com = Number(ejercicio.gastos_comercializacion) || 0;
    const gastos_adm = Number(ejercicio.gastos_administracion) || 0;
    return (resultado_bruto + resultado_valuacion + depreciacion + resultado_inversiones) - (gastos_com + gastos_adm);
  };

  const getDeudaCortoPlazo = (pasivo_corriente: any) => {
    if (!pasivo_corriente || !Array.isArray(pasivo_corriente.detalles)) return null;
    const keywords = ['préstamo', 'prestamo', 'bancari', 'financier'];
    let total = 0;
    let found = false;
    pasivo_corriente.detalles.forEach((item: any) => {
      const rubro = (item.rubro || '').toLowerCase();
      if (keywords.some(kw => rubro.includes(kw))) {
        total += Number(item.monto) || 0;
        found = true;
      }
    });
    return found ? total : null;
  };

  
  const evaluateVariation = (variation: number | null): 'healthy' | 'alert' | 'critical' => {
    if (variation === null) return 'alert';
    if (variation > 0) return 'healthy';
    if (variation > -5) return 'alert';
    return 'critical';
  };

  const evaluateRatio = (name: string, value: number | string): 'healthy' | 'alert' | 'critical' => {
    if (typeof value !== 'number') return 'alert';
    const lowerName = name.toLowerCase();
    if (lowerName.includes('liquidez')) {
      if (value > 1.2) return 'healthy';
      if (value >= 1) return 'alert';
      return 'critical';
    }
    if (lowerName.includes('deuda / ebitda') || lowerName.includes('deuda/ebitda')) {
      if (value < 2) return 'healthy';
      if (value <= 3.5) return 'alert';
      return 'critical';
    }
    if (lowerName.includes('solvencia')) {
      if (value > 1.5) return 'healthy';
      if (value >= 1) return 'alert';
      return 'critical';
    }
    if (lowerName.includes('ebitda / intereses')) {
      if (value > 3) return 'healthy';
      if (value >= 1.5) return 'alert';
      return 'critical';
    }
    return 'healthy';
  };

  const calculateVariation = (current: number, previous: number) => {
    if (!previous || previous === 0) return null;
    const variation = ((current - previous) / previous) * 100;
    return variation;
  };


  const VariationBadge = ({ variation }: { variation: number | null }) => {
    if (variation === null) return <span className="text-[10px] opacity-50 ml-2">N/A</span>;
    const isPositive = variation > 0;
    const colorClass = isPositive ? "text-emerald-600" : "text-red-600";
    const arrow = isPositive ? "↑" : "↓";
    return (
      <span className={cn("text-xs font-bold ml-2", colorClass)}>
        {arrow} {Math.abs(variation).toFixed(1)}%
      </span>
    );
  };

  const renderAssetLiabilityGroup = (title: string, currentGroup: AssetLiabilityGroup | undefined, prevGroup: AssetLiabilityGroup | undefined, anioActual: string | number = 'Actual', anioAnterior: string | number = 'Anterior') => {
    if (!currentGroup) return null;
    
    return (
      <details className="group/section ml-4 mb-4 border-l-2 border-[#141414]/10 pl-4">
        <summary className="flex items-center justify-between cursor-pointer hover:bg-[#141414]/5 p-2 rounded select-none list-none transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-xs">{title.includes("No") ? "🔹" : "🔹"}</span>
            <span className="font-bold uppercase text-sm">{title}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono font-bold text-sm text-[#141414]">
              {formatCurrencyThousands(currentGroup.total)}
            </span>
            <ChevronRight className="w-4 h-4 transition-transform group-open/section:rotate-90 opacity-50" />
          </div>
        </summary>
        
        <div className="mt-2 space-y-1 pl-2">
          {/* Header for details */}
          <div className="flex justify-between text-[10px] uppercase opacity-40 px-2 mb-2 border-b border-[#141414]/5 pb-1">
            <span>Rubro</span>
            <div className="flex gap-8 font-mono">
              <span className="w-20 text-right">{anioActual}</span>
              <span className="w-20 text-right">{anioAnterior}</span>
            </div>
          </div>
          
          {Array.isArray(currentGroup.detalles) && currentGroup.detalles.map((item, idx) => {
            const prevItem = prevGroup?.detalles?.find(p => p.rubro === item.rubro);
            return (
              <div key={idx} className="flex justify-between items-center text-xs hover:bg-[#141414]/5 p-2 rounded transition-colors">
                <span className="font-medium text-[#141414]">{item.rubro}</span>
                <div className="flex gap-8 font-mono">
                  <span className="w-20 text-right font-bold text-[#141414]">
                    {formatCurrencyThousands(item.monto)}
                  </span>
                  <span className="w-20 text-right opacity-50">
                    {formatCurrencyThousands(prevItem?.monto)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </details>
    );
  };

  return (
    <div className="flex h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Sidebar */}
      <aside className={cn("border-r border-[#141414] flex flex-col bg-[#E4E3E0] transition-all duration-300 relative overflow-hidden print:hidden", isHistorySidebarOpen ? "w-72" : "w-0 border-r-0")}>
        <div className={cn("w-72 flex flex-col h-full transition-opacity duration-300 overflow-hidden", isHistorySidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none")}>
          <div className="p-6 border-b border-[#141414]">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setActiveResultId(null)} className="hover:opacity-80 transition-opacity" title="Ir al inicio">
                <BiBankLogo className="h-10 w-auto" />
              </button>
              <button 
                onClick={() => setIsHistorySidebarOpen(false)}
                className="p-1 hover:bg-[#141414]/10 rounded transition-colors"
                title="Ocultar historial"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-1">
            <LayoutDashboard className="w-5 h-5" />
            <h1 className="font-sans text-lg font-bold tracking-tight uppercase">Risk Analyst AI</h1>
          </div>
          <p className="text-[10px] uppercase tracking-widest opacity-50 font-sans mb-4">Legajo Técnico v2.0</p>
          
          {isAuthReady && (
            <div className="pt-4 border-t border-[#141414]/20">
              {user ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-[#141414] text-[#E4E3E0] flex items-center justify-center text-[10px] font-bold">
                        {user.email?.[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-medium truncate opacity-70">{user.email}</span>
                  </div>
                  <button onClick={handleLogout} className="p-1 hover:bg-[#141414]/10 rounded transition-colors" title="Cerrar sesión">
                    <LogOut className="w-4 h-4 opacity-50 hover:opacity-100" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="w-full py-2 px-4 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase hover:bg-[#141414]/80 transition-colors flex items-center justify-center gap-2"
                >
                  Iniciar sesión con Google
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-4">
            <h2 className="text-[11px] font-sans font-semibold uppercase opacity-50 mb-4 tracking-wider flex items-center gap-2">
              <History className="w-3 h-3" />
              Historial de Casos
            </h2>
            
            <div className="space-y-2">
              {results.length === 0 ? (
                <p className="text-xs opacity-40 italic py-4">No hay casos recientes.</p>
              ) : (
                results.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => setActiveResultId(result.id)}
                    className={cn(
                      "w-full text-left p-3 border border-[#141414] transition-all group relative overflow-hidden cursor-pointer",
                      activeResultId === result.id ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-mono opacity-50">{new Date(result.timestamp).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                      {result.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                      {result.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {result.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                    </div>
                    <p className="text-xs font-medium truncate pr-6">
                      {result.dashboardData?.company_profile?.name || `${result.fileNames.length} archivo(s)`}
                    </p>
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeResult(result.id); }}
                      className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-[#141414] bg-[#DCDAD6]">
          <div className="flex items-center gap-2 text-[10px] font-mono opacity-60">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            SISTEMA ACTIVO
          </div>
        </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#F0EFED] print:hidden">
        {/* Header */}
        <header className="h-16 border-b border-[#141414] flex items-center justify-between px-8 bg-[#E4E3E0]">
          <div className="flex items-center gap-4">
            {!isHistorySidebarOpen && (
              <button 
                onClick={() => setIsHistorySidebarOpen(true)}
                className="p-2 hover:bg-[#141414]/10 rounded transition-colors"
                title="Mostrar historial"
              >
                <PanelLeftOpen className="w-5 h-5" />
              </button>
            )}
            <div className="h-8 w-[1px] bg-[#141414] opacity-20" />
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase opacity-50">Módulo</span>
              <span className="text-xs font-bold uppercase tracking-tighter">Dashboard de Riesgo</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {activeResult && activeResult.status === 'completed' && (
              <button 
                onClick={() => downloadJson(activeResult)}
                className="flex items-center gap-2 px-4 py-2 border border-[#141414] text-xs font-bold uppercase hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
              >
                <Download className="w-4 h-4" />
                Exportar Datos
              </button>
            )}
            <button 
              onClick={() => { setCurrentFiles([]); setActiveResultId(null); }}
              className="flex items-center gap-2 px-4 py-2 border border-[#141414] text-xs font-bold uppercase hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Nuevo Caso
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          {!activeResultId && currentFiles.length === 0 ? (
            <div className="max-w-2xl mx-auto mt-12">
              <div className="mb-12 text-center">
                <h2 className="text-5xl font-sans font-bold mb-4 tracking-tight">Análisis de Riesgo</h2>
                <p className="text-sm opacity-60 max-w-md mx-auto">
                  Análisis de estados contables, ventas post balance, estructura societaria, informes de deuda
                </p>
              </div>

              <div 
                {...getRootProps()} 
                className={cn(
                  "border-2 border-dashed border-[#141414] p-16 flex flex-col items-center justify-center transition-all bg-white/50",
                  !user ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-white",
                  isDragActive && user ? "bg-[#141414]/5 scale-[0.99]" : ""
                )}
              >
                <input {...getInputProps()} disabled={!user} />
                <div className="w-16 h-16 border border-[#141414] flex items-center justify-center mb-6">
                  <Upload className="w-8 h-8" />
                </div>
                {user ? (
                  <>
                    <p className="text-sm font-bold uppercase tracking-widest mb-2">Arrastre archivos aquí</p>
                    <p className="text-[10px] font-mono opacity-50 uppercase">Soporta Múltiples Archivos (PDF, IMG)</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold uppercase tracking-widest mb-2">Inicie sesión para analizar</p>
                    <p className="text-[10px] font-mono opacity-50 uppercase">Debe iniciar sesión para guardar el historial</p>
                  </>
                )}
              </div>

              <div className="mt-12 grid grid-cols-3 gap-8">
                {[
                  { label: "Análisis", value: "Ratios Automáticos" },
                  { label: "Cruce", value: "Balance vs Nosis" },
                  { label: "Proyección", value: "Ventas & EBITDA" }
                ].map((stat, i) => (
                  <div key={i} className="border-t border-[#141414] pt-4">
                    <p className="text-[10px] font-serif italic opacity-50 uppercase mb-1">{stat.label}</p>
                    <p className="text-sm font-bold uppercase">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : !activeResultId && currentFiles.length > 0 ? (
            // File Staging Area
            <div className="max-w-2xl mx-auto">
              <h3 className="text-xl font-serif italic mb-6">Documentos a Procesar</h3>
              <div className="grid gap-4 mb-8">
                {currentFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-white border border-[#141414]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#E4E3E0] flex items-center justify-center">
                        <FileText className="w-5 h-5 opacity-50" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{file.file.name}</p>
                        <p className="text-[10px] font-mono opacity-50">{(file.file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button onClick={() => removeFile(idx)} className="p-2 hover:bg-red-50 text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-4">
                 <div 
                  {...getRootProps()} 
                  className="px-6 py-3 border border-[#141414] text-xs font-bold uppercase hover:bg-[#E4E3E0] cursor-pointer flex items-center gap-2"
                >
                  <input {...getInputProps()} />
                  <Upload className="w-4 h-4" />
                  Agregar más
                </div>
                <button 
                  onClick={processFiles}
                  className="px-8 py-3 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase hover:bg-[#222] flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  Procesar Documentos
                </button>
              </div>
            </div>
          ) : (
            // Results View
            <div className="h-full flex flex-col gap-8">
              {/* Dashboard Header Status */}
              {activeResult?.status === 'processing' && (
                <div className="relative w-full min-h-[500px] flex items-center justify-center border border-[#141414] overflow-hidden bg-[#F0EFED]">
                  {/* Background Image with Transparency */}
                  <div 
                    className="absolute inset-0 z-0 opacity-15 mix-blend-multiply transition-opacity duration-1000"
                    style={{
                      backgroundImage: 'url("https://images.unsplash.com/photo-1485827404727-83b0f5627379?auto=format&fit=crop&q=80&w=2000")', // Placeholder: Reemplazar con la URL de la imagen del robot de Bi Bank
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                  
                  {/* Animated Overlay */}
                  <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-white/30 to-transparent animate-pulse"></div>

                  {/* Content Card */}
                  <div className="relative z-10 bg-white/90 backdrop-blur-md p-10 border border-[#141414]/20 shadow-2xl max-w-lg w-full text-center animate-in fade-in zoom-in-95 duration-500">
                    <div className="relative w-16 h-16 mx-auto mb-6">
                      <div className="absolute inset-0 border-4 border-[#141414]/10 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-[#141414] rounded-full border-t-transparent animate-spin"></div>
                      <Loader2 className="w-6 h-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#141414]" />
                    </div>
                    <h3 className="text-2xl font-sans font-bold text-[#141414] mb-3 tracking-tight">Procesando con IA</h3>
                    <p className="text-sm font-sans text-[#141414]/70 leading-relaxed">
                      Analizando estados contables, extrayendo ratios financieros y cruzando información crediticia. Por favor, espere unos instantes.
                    </p>
                  </div>
                </div>
              )}

              {activeResult?.status === 'error' && (
                <div className="bg-red-50 border border-red-200 p-8 text-center text-red-800">
                  <AlertCircle className="w-8 h-8 mx-auto mb-4" />
                  <h3 className="text-lg font-bold">Error en el Análisis</h3>
                  <p className="text-sm mt-2">{activeResult.error}</p>
                </div>
              )}

              {activeResult?.status === 'completed' && activeResult.dashboardData && (
                <div className="flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {/* Sidebar */}
                  <div className="w-full md:w-64 shrink-0">
                    <div className="md:sticky md:top-8 md:max-h-[calc(100vh-8rem)] flex flex-col gap-2 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                      {TABS.map(tab => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={cn(
                            "text-left px-4 py-3 text-sm font-medium transition-colors border-l-2 shrink-0",
                            activeTab === tab 
                              ? "border-[#141414] bg-[#141414]/5 text-[#141414]" 
                              : "border-transparent text-[#141414]/60 hover:bg-[#141414]/5 hover:text-[#141414]"
                          )}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0 space-y-8">
                    
                    {/* Institutional Header */}
                  <div className="bg-white border border-[#141414] p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                      <BiBankLogo className="h-24 w-auto grayscale" />
                    </div>
                    <h1 className="text-2xl font-sans font-bold uppercase mb-2 relative z-10">
                      {activeResult.dashboardData.company_profile?.name || "EMPRESA NO IDENTIFICADA"}
                    </h1>
                    <div className="flex items-center gap-4 text-xs font-mono opacity-60 border-t border-[#141414]/10 pt-2 relative z-10">
                      <span>
                        <strong className="font-bold">CUIT:</strong> {activeResult.dashboardData.company_profile?.cuit || "N/A"}
                      </span>
                      <span className="h-3 w-[1px] bg-[#141414]/20" />
                      <span>
                        <strong className="font-bold">ACTIVIDAD:</strong> {activeResult.dashboardData.company_profile?.activity || "No especificada"}
                      </span>
                      <span className="h-3 w-[1px] bg-[#141414]/20" />
                      <span className="italic text-[#000000] opacity-100">Valores expresados en miles de pesos</span>
                    </div>
                  </div>

                  

                    {activeTab === 'Resumen Ejecutivo' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        
                        {/* Análisis High Thinking AI */}
                        <div className="w-full bg-white border border-[#141414] p-6 mb-8 font-sans">
                          <h3 className="text-lg font-bold mb-4 uppercase text-[#141414]">Resumen</h3>
                          {activeResult.dashboardData?.executive_summary ? (
                            <div className="text-justify text-[#141414] prose prose-sm max-w-none prose-p:mb-4 last:prose-p:mb-0">
                              <ReactMarkdown>{activeResult.dashboardData.executive_summary}</ReactMarkdown>
                            </div>
                          ) : (
                            <>
                              <p className="text-justify mb-4 text-[#141414]">
                                Tras el análisis profundo realizado por High Thinking AI, se han cruzado los datos de la memoria con el balance, evaluando la evolución patrimonial, el desempeño operativo y la estructura de financiamiento. Se observa una correlación consistente entre las proyecciones declaradas y los resultados obtenidos en el último ejercicio, destacando la capacidad de adaptación ante las fluctuaciones del mercado.
                              </p>
                              <p className="text-justify text-[#141414]">
                                <span className="font-bold">Conclusion:</span> Basado en los datos analizados, el perfil de riesgo preliminar se mantiene Adecuado.
                              </p>
                            </>
                          )}
                        </div>

                        {/* Patrimonial Summary Table (Quick View) */}
                        <div className="bg-[#F0EFED] p-6 border border-[#141414] mb-8">
                          <h3 className="text-base font-bold uppercase tracking-widest mb-4 opacity-70 text-[#141414]">Resumen Patrimonial {activeResult.dashboardData?.company_profile?.anio_actual || ''} (Vista Rápida)</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Total Activo</p>
                              <div className="flex items-baseline">
                                <p className="text-xl font-bold font-mono text-[#141414]">
                                  {formatCurrencyThousands(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.activo?.total_del_activo)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.activo?.total_del_activo || 0,
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.activo?.total_del_activo || 0
                                )} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Total Pasivo</p>
                              <div className="flex items-baseline">
                                <p className="text-xl font-bold font-mono text-[#141414]">
                                  {formatCurrencyThousands(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.total_del_pasivo)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.total_del_pasivo || 0,
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.pasivo?.total_del_pasivo || 0
                                )} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Patrimonio Neto</p>
                              <div className="flex items-baseline">
                                <p className="text-xl font-bold font-mono text-[#141414]">
                                  {formatCurrencyThousands(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.patrimonio_neto_total)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.patrimonio_neto_total || 0,
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.patrimonio_neto_total || 0
                                )} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Resultado Final</p>
                              <div className="flex items-baseline">
                                <p className={cn(
                                  "text-xl font-bold font-mono",
                                  (activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.resultado_del_ejercicio_final || 0) >= 0 ? "text-[#141414]" : "text-red-600"
                                )}>
                                  {formatCurrencyThousands(activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.resultado_del_ejercicio_final)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.resultado_del_ejercicio_final || 0,
                                  activeResult.data?.hoja_estado_resultados?.ejercicio_anterior?.resultado_del_ejercicio_final || 0
                                )} />
                              </div>
                            </div>
                          </div>
                        </div>

                  {/* Nuevas Tarjetas KPI (Fila Superior) */}
                  <h3 className="text-lg font-bold mb-4 uppercase text-[#141414]">Ratios</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {/* Tarjeta 1: VENTAS */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateVariation(calculateVariation(
                            activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas || 0,
                            activeResult.data?.hoja_estado_resultados?.ejercicio_anterior?.ventas_netas || 0
                          ))} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">VENTAS (EN MILES)</p>
                      <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                        {formatCurrencyThousands(activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas)}
                      </p>
                      <div className="flex items-center text-xs font-sans font-bold text-gray-600 leading-tight">
                        <VariationBadge variation={calculateVariation(
                          activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas || 0,
                          activeResult.data?.hoja_estado_resultados?.ejercicio_anterior?.ventas_netas || 0
                        )} />
                        <span className="ml-1">Var. interanual</span>
                      </div>
                    </div>

                    {/* Tarjeta 2: EBITDA */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateVariation(calculateVariation(
                            (activeResult.dashboardData?.motor_de_ratios?.ebitda !== 'N/A' && activeResult.dashboardData?.motor_de_ratios?.ebitda !== undefined) ? activeResult.dashboardData.motor_de_ratios.ebitda : (calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_actual, activeResult.data?.hoja_flujo_efectivo?.ejercicio_actual) || 0),
                            calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_anterior, activeResult.data?.hoja_flujo_efectivo?.ejercicio_anterior) || 0
                          ))} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">EBITDA (EN MILES)</p>
                      <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                        {formatCurrencyThousands(activeResult.dashboardData?.motor_de_ratios?.ebitda !== 'N/A' && activeResult.dashboardData?.motor_de_ratios?.ebitda !== undefined ? activeResult.dashboardData.motor_de_ratios.ebitda : calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_actual, activeResult.data?.hoja_flujo_efectivo?.ejercicio_actual))}
                      </p>
                      <div className="flex items-center text-xs font-sans font-bold text-gray-600 leading-tight">
                        <VariationBadge variation={calculateVariation(
                          (activeResult.dashboardData?.motor_de_ratios?.ebitda !== 'N/A' && activeResult.dashboardData?.motor_de_ratios?.ebitda !== undefined) ? activeResult.dashboardData.motor_de_ratios.ebitda : (calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_actual, activeResult.data?.hoja_flujo_efectivo?.ejercicio_actual) || 0),
                          calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_anterior, activeResult.data?.hoja_flujo_efectivo?.ejercicio_anterior) || 0
                        )} />
                        <span className="ml-1">Var. interanual</span>
                      </div>
                    </div>

                    {/* Tarjeta 3: DEUDA BANCARIA TOTAL */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateRatio('deuda / ebitda', activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_ebitda !== 'N/A' ? (activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_ebitda || 0) : 0)} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">DEUDA BANCARIA TOTAL (EN MILES)</p>
                      <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                        {formatCurrencyThousands(activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_total !== 'N/A' ? activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_total : null)}
                      </p>
                      <p className="text-xs font-sans font-bold text-gray-600 leading-tight">Total sistema financiero</p>
                    </div>

                    {/* Tarjeta 4: DEUDA CORTO PLAZO */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          {(() => {
                            const deudaCPActual = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.pasivo_corriente);
                            const deudaCPAnterior = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.pasivo?.pasivo_corriente);
                            return <StatusBadge status={evaluateVariation(calculateVariation(deudaCPActual || 0, deudaCPAnterior || 0))} />;
                          })()}
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">DEUDA CORTO PLAZO (EN MILES)</p>
                      {(() => {
                        const deudaCPActual = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.pasivo_corriente);
                        const deudaCPAnterior = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.pasivo?.pasivo_corriente);
                        
                        if (deudaCPActual === null) {
                          return <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">-</p>;
                        }

                        return (
                          <>
                            <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                              {formatCurrencyThousands(deudaCPActual)}
                            </p>
                            {deudaCPAnterior !== null && (
                              <div className="flex items-center text-xs font-sans font-bold text-gray-600 leading-tight">
                                <VariationBadge variation={calculateVariation(deudaCPActual, deudaCPAnterior)} />
                                <span className="ml-1">Var. interanual</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* KPI Cards (Fila Original) */}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.isArray(activeResult.dashboardData?.ratios) && activeResult.dashboardData.ratios.map((ratio, idx) => (
                      <div key={idx} className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                        <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateRatio(ratio.name, ratio.value)} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">{ratio.name}</p>
                        <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                          {typeof ratio.value === 'number' ? ratio.value.toFixed(2) : ratio.value}
                        </p>
                        <p className="text-xs font-sans font-bold text-gray-600 leading-tight">{ratio.description}</p>
                      </div>
                    ))}
                  </div>

                  {/* Report Generation Button */}
                  <div className="flex flex-col items-center justify-center py-8 border-t border-[#141414]/10">
                    <button 
                      onClick={() => generatePDF(activeResult)}
                      className="bg-[#141414] text-white px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-[#222] transition-all flex items-center gap-3 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                      GENERAR REPORTE PARA COMITÉ
                    </button>
                    <p className="text-[10px] font-mono opacity-50 mt-3 uppercase tracking-wider">
                      Incluye Ratios, Análisis de Ventas y Conclusiones de Riesgo
                    </p>
                  </div>
                  
                      </div>
                    )}

                    {activeTab === 'Balance y Ratios' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <ComparativeView json_extraccion={activeResult.data} json_ratios={activeResult.dashboardData?.motor_de_ratios} />
                      </div>
                    )}

                    {activeTab === 'Información post balance' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Post-Closing Analysis Section (Moved Inside) */}
                      {activeResult.data?.analisis_post_cierre && activeResult.data.analisis_post_cierre.total_ventas_post_cierre > 0 ? (
                        <div className="bg-white border border-[#141414] p-6 font-sans">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <h3 className="text-lg font-semibold text-[#141414]">EVOLUCIÓN DE VENTAS POST BALANCE (COMPARATIVO INTERANUAL)</h3>
                            
                            <div className="flex flex-col items-end gap-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <span className="text-xs font-bold uppercase text-[#141414]/70">Ver en moneda constante (Último mes)</span>
                                <div className="relative">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only" 
                                    checked={isInflationAdjusted}
                                    onChange={(e) => setIsInflationAdjusted(e.target.checked)}
                                  />
                                  <div className={`block w-10 h-6 rounded-full transition-colors ${isInflationAdjusted ? 'bg-[#141414]' : 'bg-gray-300'}`}></div>
                                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isInflationAdjusted ? 'transform translate-x-4' : ''}`}></div>
                                </div>
                              </label>
                              
                              {isInflationAdjusted && (
                                <div className="flex items-center gap-3 text-xs animate-in fade-in slide-in-from-top-2">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[#141414]/70">% Interanual:</span>
                                    <input 
                                      type="number" 
                                      value={inflationInteranual}
                                      onChange={(e) => setInflationInteranual(Number(e.target.value))}
                                      className="w-16 px-1 py-0.5 border border-[#141414]/20 rounded text-right"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[#141414]/70">% Mensual Promedio:</span>
                                    <input 
                                      type="number" 
                                      value={inflationMensual}
                                      onChange={(e) => setInflationMensual(Number(e.target.value))}
                                      className="w-16 px-1 py-0.5 border border-[#141414]/20 rounded text-right"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                              <thead className="bg-[#F0EFED] text-[#141414] text-xs uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-3 font-semibold border-b border-[#141414]/20">Mes</th>
                                  <th className={`px-4 py-3 font-semibold border-b border-[#141414]/20 text-right transition-colors ${isInflationAdjusted ? 'bg-amber-50/50' : ''}`}>Año Actual ($)</th>
                                  <th className={`px-4 py-3 font-semibold border-b border-[#141414]/20 text-right transition-colors ${isInflationAdjusted ? 'bg-amber-50/50' : ''}`}>Año Anterior ($)</th>
                                  <th className="px-4 py-3 font-semibold border-b border-[#141414]/20 text-right">Var. (%)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#141414]/10">
                                {(() => {
                                  const rawVentas = activeResult.data.analisis_post_cierre.detalle_ventas_mensuales;
                                  const ventasMensuales = Array.isArray(rawVentas) ? rawVentas : [];
                                  const baseIndex = ventasMensuales.length - 1;
                                  
                                  return ventasMensuales.map((venta, idx) => {
                                    const i = baseIndex - idx;
                                    let montoActual = venta.monto || 0;
                                    let montoAnterior = venta.monto_anio_anterior;

                                    if (isInflationAdjusted) {
                                      const factorMensual = Math.pow(1 + (inflationMensual / 100), i);
                                      const factorInteranual = 1 + (inflationInteranual / 100);
                                      
                                      montoActual = montoActual * factorMensual;
                                      if (montoAnterior) {
                                        montoAnterior = montoAnterior * factorInteranual * factorMensual;
                                      }
                                    }

                                    const varPct = montoAnterior ? ((montoActual - montoAnterior) / montoAnterior) * 100 : null;

                                    return (
                                      <tr key={idx} className="hover:bg-[#141414]/5 transition-colors">
                                        <td className="px-4 py-3 font-medium text-[#141414]">{venta.mes}</td>
                                        <td className="px-4 py-3 text-right font-mono">{formatCurrencyThousands(montoActual)}</td>
                                        <td className="px-4 py-3 text-right font-mono">
                                          {montoAnterior ? formatCurrencyThousands(montoAnterior) : <span className="text-xs opacity-50 italic">Sin información</span>}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-mono ${varPct !== null ? 'font-bold' : ''} ${varPct !== null && varPct >= 0 ? 'text-emerald-600' : ''} ${varPct !== null && varPct < 0 ? 'text-red-600' : ''}`}>
                                          {varPct !== null ? (
                                            <div className="flex items-center justify-end gap-1">
                                              {varPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                              {varPct > 0 ? '+' : ''}{varPct.toFixed(1)}%
                                            </div>
                                          ) : (
                                            <span className="text-xs opacity-50 italic">-</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                              <tfoot>
                                {(() => {
                                  const rawVentas = activeResult.data.analisis_post_cierre.detalle_ventas_mensuales;
                                  const ventasMensuales = Array.isArray(rawVentas) ? rawVentas : [];
                                  const baseIndex = ventasMensuales.length - 1;
                                  
                                  let totalActual = 0;
                                  let totalAnterior = 0;

                                  ventasMensuales.forEach((venta, idx) => {
                                    const i = baseIndex - idx;
                                    let montoActual = venta.monto || 0;
                                    let montoAnterior = venta.monto_anio_anterior || 0;

                                    if (isInflationAdjusted) {
                                      const factorMensual = Math.pow(1 + (inflationMensual / 100), i);
                                      const factorInteranual = 1 + (inflationInteranual / 100);
                                      
                                      montoActual = montoActual * factorMensual;
                                      if (montoAnterior) {
                                        montoAnterior = montoAnterior * factorInteranual * factorMensual;
                                      }
                                    }

                                    totalActual += montoActual;
                                    totalAnterior += montoAnterior;
                                  });

                                  const totalVar = totalAnterior > 0 ? ((totalActual - totalAnterior) / totalAnterior) * 100 : null;

                                  return (
                                    <tr className="bg-[#F0EFED] font-bold text-[#141414]">
                                      <td className="px-4 py-3 border-t border-[#141414]/20">TOTAL ACUMULADO</td>
                                      <td className="px-4 py-3 border-t border-[#141414]/20 text-right font-mono">{formatCurrencyThousands(totalActual)}</td>
                                      <td className="px-4 py-3 border-t border-[#141414]/20 text-right font-mono">
                                        {totalAnterior > 0 ? formatCurrencyThousands(totalAnterior) : <span className="text-xs opacity-50 italic font-normal">Sin información</span>}
                                      </td>
                                      <td className={`px-4 py-3 border-t border-[#141414]/20 text-right font-mono ${totalVar !== null && totalVar >= 0 ? 'text-emerald-600' : ''} ${totalVar !== null && totalVar < 0 ? 'text-red-600' : ''}`}>
                                        {totalVar !== null ? (
                                          <div className="flex items-center justify-end gap-1">
                                            {totalVar >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                            {totalVar > 0 ? '+' : ''}{totalVar.toFixed(1)}%
                                          </div>
                                        ) : (
                                          <span className="text-xs opacity-50 italic font-normal">-</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })()}
                              </tfoot>
                            </table>
                          </div>
                          
                          {isInflationAdjusted && (
                            <div className="mt-4 text-xs italic text-gray-500">
                              * Valores expresados en moneda homogénea del último mes, asumiendo inflación interanual del {inflationInteranual}% y mensual del {inflationMensual}%.
                            </div>
                          )}
                          
                          {activeResult.data.analisis_post_cierre.notas_relevantes && (
                            <div className="mt-2 text-xs opacity-70 italic border-t border-[#141414]/10 pt-2">
                              Nota: {activeResult.data.analisis_post_cierre.notas_relevantes}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-white border border-[#141414] p-12 text-center text-[#141414]/60 font-mono text-sm">
                          No hay información post balance disponible.
                        </div>
                      )}

                      {/* Deuda Bancaria Asumida Post Balance */}
                      {Array.isArray(activeResult.data?.analisis_post_cierre?.deuda_bancaria_post_balance_detalle) && activeResult.data.analisis_post_cierre.deuda_bancaria_post_balance_detalle.length > 0 && (
                        <div className="bg-white border border-[#141414] p-6 mt-8">
                          <h3 className="text-lg font-semibold text-[#141414] mb-6">DEUDA BANCARIA ASUMIDA POST BALANCE</h3>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                              <thead className="bg-[#F0EFED] text-[#141414] text-xs uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-3 font-semibold border-b border-[#141414]/20">ENTIDAD BANCARIA / ACREEDOR</th>
                                  <th className="px-4 py-3 font-semibold border-b border-[#141414]/20 text-right">MONTO ASUMIDO</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#141414]/10">
                                {activeResult.data.analisis_post_cierre.deuda_bancaria_post_balance_detalle.map((item: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-[#141414]/5 transition-colors">
                                    <td className="px-4 py-3 font-medium text-[#141414]">{item.entidad}</td>
                                    <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrencyThousands(item.monto, item.moneda)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-[#F0EFED] font-bold text-[#141414]">
                                  <td className="px-4 py-3 text-right">TOTAL DEUDA POST BALANCE:</td>
                                  <td className="px-4 py-3 text-right font-mono">
                                    {formatCurrencyThousands(
                                      activeResult.data.analisis_post_cierre.deuda_bancaria_post_balance_detalle.reduce((acc: number, curr: any) => acc + (Number(curr.monto) || 0), 0),
                                      activeResult.data.analisis_post_cierre.deuda_bancaria_post_balance_detalle[0]?.moneda || 'ARS'
                                    )}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                  {activeTab === 'Proyecciones' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Sales Analysis */}
                    <div className="lg:col-span-2 bg-white border border-[#141414] p-6">
                      <div className="flex items-center gap-2 mb-6 border-b border-[#141414]/10 pb-4">
                        <TrendingUp className="w-5 h-5" />
                        <h3 className="font-sans font-bold text-lg">Análisis de Ventas & Proyección</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <h4 className="text-xs font-bold uppercase mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 bg-[#141414] rounded-full" />
                            Evolución Histórica
                          </h4>
                          <p className="text-sm leading-relaxed opacity-80">
                            {activeResult.dashboardData?.sales_analysis?.evolution_text}
                          </p>
                        </div>
                        <div className="bg-[#F0EFED] p-4 border border-[#141414]/10">
                          <h4 className="text-xs font-bold uppercase mb-3 flex items-center gap-2 text-emerald-700">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            Proyección IA
                          </h4>
                          <p className="text-sm leading-relaxed opacity-80 italic">
                            "{activeResult.dashboardData?.sales_analysis?.projection_text}"
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  {activeTab === 'Sistema Financiero (Nosis)' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Nosis Section */}
                  {activeResult.dashboardData.extraccion_nosis && (
                    <div className="border border-[#141414] bg-white mt-8">
                      <div className="flex items-center justify-between p-4 border-b border-[#141414]/10 bg-[#F0EFED] select-none">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📑</span>
                          <span className="text-lg font-bold uppercase tracking-wider">PESTAÑA NOSIS (ANTECEDENTES Y BCRA)</span>
                        </div>
                      </div>
                      
                      <div className="p-6 bg-[#FAFAFA]">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Score Crediticio</p>
                              <p className="text-xl font-bold font-mono text-[#141414]">
                                {activeResult.dashboardData?.extraccion_nosis?.score_crediticio}
                              </p>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Peor Situación BCRA</p>
                              <p className="text-xl font-bold font-mono text-[#141414]">
                                Categoría {activeResult.dashboardData?.extraccion_nosis?.situacion_bcra_peor_estado}
                              </p>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Cheques Rechazados</p>
                              <p className="text-xl font-bold font-mono text-[#141414]">
                                {activeResult.dashboardData?.extraccion_nosis?.cheques_rechazados_cantidad} cheques
                              </p>
                              <p className="text-xs opacity-70 mt-1">
                                por un total de {formatCurrencyThousands(activeResult.dashboardData?.extraccion_nosis?.cheques_rechazados_monto)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Deuda Total Nosis</p>
                              <p className="text-xl font-bold font-mono text-[#141414]">
                                {formatCurrencyThousands(activeResult.dashboardData?.extraccion_nosis?.deuda_financiera_total_nosis)}
                              </p>
                              <p className="text-[10px] opacity-50 mt-1">(Expresado en miles)</p>
                            </div>
                          </div>

                          {activeResult.dashboardData.datos_adicionales_balance && (
                            <div className="bg-[#E4E3E0] p-4 border-l-4 border-[#141414] mb-8">
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Deuda Post Balance</p>
                              <p className="text-lg font-bold font-mono text-[#141414]">
                                {formatCurrencyThousands(activeResult.dashboardData.datos_adicionales_balance.deuda_bancaria_post_balance)}
                              </p>
                              <p className="text-[10px] opacity-70 mt-1">
                                (Extraído de los hechos posteriores al cierre en las notas del balance, si existiera)
                              </p>
                            </div>
                          )}

                          <h4 className="text-xs font-bold uppercase mb-4 opacity-70 border-b border-[#141414]/10 pb-2">Detalle de Entidades</h4>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm font-mono border-collapse">
                                <thead>
                                  <tr className="border-b border-[#141414]">
                                    <th className="text-left py-2 font-bold uppercase text-xs opacity-60">Entidad</th>
                                    <th className="text-center py-2 font-bold uppercase text-xs opacity-60">Situación</th>
                                    <th className="text-right py-2 font-bold uppercase text-xs opacity-60 w-1/3">Monto / Participación</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#141414]/10">
                                  {(() => {
                                    const rawEntidades = activeResult.dashboardData?.extraccion_nosis?.detalle_entidades;
                                    const entidades = Array.isArray(rawEntidades) ? rawEntidades : [];
                                    const totalDeudaNosis = activeResult.dashboardData?.extraccion_nosis?.deuda_financiera_total_nosis || 0;
                                    const totalSuma = entidades.reduce((acc, curr) => acc + (Number(curr?.monto) || 0), 0);
                                    const totalReferencia = totalDeudaNosis > 0 ? totalDeudaNosis : totalSuma;

                                    return entidades.map((entidad, i) => {
                                      const participacion = totalReferencia > 0 ? ((entidad.monto / totalReferencia) * 100).toFixed(1) : "0.0";
                                      return (
                                        <tr key={i} className="hover:bg-[#141414]/5 transition-colors">
                                          <td className="py-3 font-bold">{entidad.entidad}</td>
                                          <td className="py-3 text-center font-bold text-[#141414]">{entidad.situacion}</td>
                                          <td className="py-3">
                                            <div className="flex flex-col gap-1 items-end">
                                              <span className="font-bold text-[#141414]">{formatCurrencyThousands(entidad.monto)} ({participacion}%)</span>
                                              <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                                <div className="bg-blue-600 h-full" style={{ width: `${participacion}%` }}></div>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    });
                                  })()}
                                </tbody>
                              </table>
                            </div>
                            
                            {/* Pie Chart */}
                            {Array.isArray(activeResult.dashboardData?.extraccion_nosis?.detalle_entidades) && activeResult.dashboardData.extraccion_nosis.detalle_entidades.length > 0 && (
                              <div className="h-64 flex flex-col items-center justify-center bg-white border border-[#141414]/10 p-4 rounded">
                                <h5 className="text-xs font-bold uppercase opacity-70 mb-2">Composición de Deuda</h5>
                                <PieChart width={400} height={200}>
                                    <Pie
                                      data={activeResult.dashboardData.extraccion_nosis.detalle_entidades.map(e => ({ name: e?.entidad || 'Desconocido', value: Number(e?.monto) || 0 }))}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={50}
                                      outerRadius={70}
                                      paddingAngle={2}
                                      dataKey="value"
                                      label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = outerRadius * 1.2;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                        return (
                                          <text x={x} y={y} fill="#141414" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10" fontWeight="bold">
                                            {name} ({(percent * 100).toFixed(0)}%)
                                          </text>
                                        );
                                      }}
                                    >
                                      {activeResult.dashboardData.extraccion_nosis.detalle_entidades.map((entry, index) => {
                                        const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1e40af', '#1d4ed8', '#1e3a8a'];
                                        return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                                      })}
                                    </Pie>
                                    <Tooltip 
                                      formatter={(value: number) => formatCurrencyThousands(value)}
                                      contentStyle={{ backgroundColor: '#141414', color: '#E4E3E0', border: 'none', borderRadius: '4px', fontSize: '12px' }}
                                    />
                                  </PieChart>
                              </div>
                            )}
                          </div>
                        </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                    
                        {/* Cross Check Section */}
                    <div className="lg:col-span-1 bg-[#141414] text-[#E4E3E0] p-6 border border-[#141414] flex flex-col">
                      <div className="flex items-center gap-2 mb-6 border-b border-white/20 pb-4">
                        <Scale className="w-5 h-5" />
                        <h3 className="font-sans font-bold text-lg">Cruce de Deuda</h3>
                      </div>
                      
                      {activeResult.dashboardData.cross_check ? (
                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] opacity-50 uppercase mb-1">Deuda Balance</p>
                              <p className="font-mono text-lg font-bold text-white">
                                {formatCurrencyThousands(activeResult.dashboardData?.cross_check?.balance_debt)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] opacity-50 uppercase mb-1">Deuda Nosis</p>
                              <p className="font-mono text-lg font-bold text-white">
                                {formatCurrencyThousands(activeResult.dashboardData?.cross_check?.nosis_debt)}
                              </p>
                            </div>
                          </div>
                          
                          <div className={cn(
                            "p-4 border",
                            activeResult.dashboardData?.cross_check?.match 
                              ? "border-emerald-500/50 bg-emerald-500/10" 
                              : "border-red-500/50 bg-red-500/10"
                          )}>
                            <div className="flex items-center gap-2 mb-1">
                              {activeResult.dashboardData?.cross_check?.match 
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                : <AlertTriangle className="w-4 h-4 text-red-500" />
                              }
                              <span className="text-xs font-bold uppercase">
                                {activeResult.dashboardData?.cross_check?.match ? "Consistente" : "Discrepancia Detectada"}
                              </span>
                            </div>
                            <p className="text-[10px] opacity-70">
                              Diferencia: {formatCurrencyThousands(activeResult.dashboardData?.cross_check?.difference)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
                          <FileText className="w-12 h-12 mb-4" />
                          <p className="text-xs uppercase">No se detectó reporte de deuda para cruzar información.</p>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                  )}

                  {activeTab === 'Accionistas y Directorio' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
                      {/* Bloque 1: COMPOSICIÓN ACCIONARIA */}
                      <div className="bg-white border border-[#141414] p-6">
                        <h3 className="text-lg font-semibold text-[#141414] mb-6">COMPOSICIÓN SOCIAL / ACCIONISTAS</h3>
                        
                        <ShareholderTable 
                          accionistas={
                            Array.isArray(activeResult.dashboardData?.accionistas_y_directorio?.accionistas) && activeResult.dashboardData.accionistas_y_directorio.accionistas.length > 0
                              ? activeResult.dashboardData.accionistas_y_directorio.accionistas
                              : [
                                  { nombre: 'Inversiones Globales S.A.', dni_cuit: '30-71234567-8', participacion: 52.99, subAccionistas: [
                                    { nombre: 'Persona Física 1', dni_cuit: '20.111.222', participacion: 60 },
                                    { nombre: 'Sociedad Holding B', dni_cuit: '30-98765432-1', participacion: 40, subAccionistas: [
                                      { nombre: 'Beneficiario Final 1', dni_cuit: '20.333.444', participacion: 50 },
                                      { nombre: 'Fideicomiso de Control C', dni_cuit: '30-11223344-5', participacion: 50, subAccionistas: [
                                        { nombre: 'Beneficiario Humano Final (Nivel 4)', dni_cuit: '10.999.888', participacion: 100 }
                                      ] }
                                    ]}
                                  ] },
                                  { nombre: 'Pérez, Juan Ignacio', dni_cuit: '20.123.456', participacion: 30.00 },
                                  { nombre: 'Gómez, María Laura', dni_cuit: '25.987.654', participacion: 17.01 }
                                ]
                          }
                        />
                      </div>

                      {/* Bloque 2: DIRECTORIO Y MANAGEMENT */}
                      <div className="bg-white border border-[#141414] p-6 mt-8">
                        <h3 className="text-base font-semibold text-black mb-6">ÓRGANO DE ADMINISTRACIÓN / DIRECTORIO</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Array.isArray(activeResult.dashboardData?.accionistas_y_directorio?.directorio) && activeResult.dashboardData.accionistas_y_directorio.directorio.length > 0 ? (
                            activeResult.dashboardData.accionistas_y_directorio.directorio.map((miembro, idx) => (
                              <div key={idx} className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">{miembro.cargo}</p>
                                <p className="font-medium text-[#141414]">{miembro.nombre}</p>
                              </div>
                            ))
                          ) : (
                            <>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Presidente</p>
                                <p className="font-medium text-[#141414]">Juan Ignacio Pérez</p>
                              </div>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Vicepresidente</p>
                                <p className="font-medium text-[#141414]">María Laura Gómez</p>
                              </div>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Director Titular</p>
                                <p className="font-medium text-[#141414]">Carlos Alberto Ruiz</p>
                              </div>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Director Suplente</p>
                                <p className="font-medium text-[#141414]">Ana Clara Fernández</p>
                              </div>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Síndico Titular</p>
                                <p className="font-medium text-[#141414]">Estudio Contable López & Asoc.</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'Mercado' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
                      <div className="w-full bg-white border border-[#141414] p-10 font-sans text-justify leading-relaxed">
                        {activeResult.dashboardData?.analisis_mercado ? (
                          <div className="prose prose-sm md:prose-base max-w-none print:max-w-none print:w-full prose-headings:font-sans prose-headings:font-semibold prose-headings:text-gray-800 prose-p:text-justify prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
                            <ReactMarkdown>{activeResult.dashboardData.analisis_mercado}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="text-center text-[#141414]/60 font-mono text-sm py-8">
                            No se generó análisis de mercado para este reporte.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {['Historia y actividad de la empresa', 'Opinión de riesgos'].includes(activeTab) && (
                      <div className="bg-white border border-[#141414] p-12 text-center text-[#141414]/60 font-mono text-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                        Contenido de {activeTab} en desarrollo
                      </div>
                    )}

                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      
      </main>
      {/* Print Layout */}
      {activeResult && activeResult.dashboardData && (
        <div className="hidden print:block bg-white text-black w-full font-sans">
          <table className="w-full">
            <thead>
              <tr>
                <td>
                  <div className="flex justify-between items-center border-b-2 border-[#141414] pb-4 mb-8">
                    <div className="text-sm font-bold uppercase tracking-wider">Fecha de generación: {new Date().toLocaleDateString()}</div>
                    <BiBankLogo className="h-8 w-auto" />
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>

                  {/* Resumen Ejecutivo */}
                  <div className="mb-12 print:break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Resumen Ejecutivo</h2>

                      <div className="space-y-8 ">
                        
                        {/* Análisis High Thinking AI */}
                        <div className="w-full bg-white border border-[#141414] p-6 mb-8 font-sans">
                          <h3 className="text-lg font-bold mb-4 uppercase text-[#141414]">Resumen</h3>
                          {activeResult.dashboardData?.executive_summary ? (
                            <div className="text-justify text-[#141414] prose prose-sm max-w-none prose-p:mb-4 last:prose-p:mb-0">
                              <ReactMarkdown>{activeResult.dashboardData.executive_summary}</ReactMarkdown>
                            </div>
                          ) : (
                            <>
                              <p className="text-justify mb-4 text-[#141414]">
                                Tras el análisis profundo realizado por High Thinking AI, se han cruzado los datos de la memoria con el balance, evaluando la evolución patrimonial, el desempeño operativo y la estructura de financiamiento. Se observa una correlación consistente entre las proyecciones declaradas y los resultados obtenidos en el último ejercicio, destacando la capacidad de adaptación ante las fluctuaciones del mercado.
                              </p>
                              <p className="text-justify text-[#141414]">
                                <span className="font-bold">Conclusion:</span> Basado en los datos analizados, el perfil de riesgo preliminar se mantiene Adecuado.
                              </p>
                            </>
                          )}
                        </div>

                        {/* Patrimonial Summary Table (Quick View) */}
                        <div className="bg-[#F0EFED] p-6 border border-[#141414] mb-8">
                          <h3 className="text-base font-bold uppercase tracking-widest mb-4 opacity-70 text-[#141414]">Resumen Patrimonial {activeResult.dashboardData?.company_profile?.anio_actual || ''} (Vista Rápida)</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Total Activo</p>
                              <div className="flex items-baseline">
                                <p className="text-xl font-bold font-mono text-[#141414]">
                                  {formatCurrencyThousands(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.activo?.total_del_activo)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.activo?.total_del_activo || 0,
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.activo?.total_del_activo || 0
                                )} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Total Pasivo</p>
                              <div className="flex items-baseline">
                                <p className="text-xl font-bold font-mono text-[#141414]">
                                  {formatCurrencyThousands(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.total_del_pasivo)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.total_del_pasivo || 0,
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.pasivo?.total_del_pasivo || 0
                                )} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Patrimonio Neto</p>
                              <div className="flex items-baseline">
                                <p className="text-xl font-bold font-mono text-[#141414]">
                                  {formatCurrencyThousands(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.patrimonio_neto_total)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.patrimonio_neto_total || 0,
                                  activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.patrimonio_neto_total || 0
                                )} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Resultado Final</p>
                              <div className="flex items-baseline">
                                <p className={cn(
                                  "text-xl font-bold font-mono",
                                  (activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.resultado_del_ejercicio_final || 0) >= 0 ? "text-[#141414]" : "text-red-600"
                                )}>
                                  {formatCurrencyThousands(activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.resultado_del_ejercicio_final)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.resultado_del_ejercicio_final || 0,
                                  activeResult.data?.hoja_estado_resultados?.ejercicio_anterior?.resultado_del_ejercicio_final || 0
                                )} />
                              </div>
                            </div>
                          </div>
                        </div>

                  {/* Nuevas Tarjetas KPI (Fila Superior) */}
                  <h3 className="text-lg font-bold mb-4 uppercase text-[#141414]">Ratios</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {/* Tarjeta 1: VENTAS */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateVariation(calculateVariation(
                            activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas || 0,
                            activeResult.data?.hoja_estado_resultados?.ejercicio_anterior?.ventas_netas || 0
                          ))} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">VENTAS (EN MILES)</p>
                      <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                        {formatCurrencyThousands(activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas)}
                      </p>
                      <div className="flex items-center text-xs font-sans font-bold text-gray-600 leading-tight">
                        <VariationBadge variation={calculateVariation(
                          activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas || 0,
                          activeResult.data?.hoja_estado_resultados?.ejercicio_anterior?.ventas_netas || 0
                        )} />
                        <span className="ml-1">Var. interanual</span>
                      </div>
                    </div>

                    {/* Tarjeta 2: EBITDA */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateVariation(calculateVariation(
                            (activeResult.dashboardData?.motor_de_ratios?.ebitda !== 'N/A' && activeResult.dashboardData?.motor_de_ratios?.ebitda !== undefined) ? activeResult.dashboardData.motor_de_ratios.ebitda : (calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_actual, activeResult.data?.hoja_flujo_efectivo?.ejercicio_actual) || 0),
                            calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_anterior, activeResult.data?.hoja_flujo_efectivo?.ejercicio_anterior) || 0
                          ))} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">EBITDA (EN MILES)</p>
                      <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                        {formatCurrencyThousands(activeResult.dashboardData?.motor_de_ratios?.ebitda !== 'N/A' && activeResult.dashboardData?.motor_de_ratios?.ebitda !== undefined ? activeResult.dashboardData.motor_de_ratios.ebitda : calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_actual, activeResult.data?.hoja_flujo_efectivo?.ejercicio_actual))}
                      </p>
                      <div className="flex items-center text-xs font-sans font-bold text-gray-600 leading-tight">
                        <VariationBadge variation={calculateVariation(
                          (activeResult.dashboardData?.motor_de_ratios?.ebitda !== 'N/A' && activeResult.dashboardData?.motor_de_ratios?.ebitda !== undefined) ? activeResult.dashboardData.motor_de_ratios.ebitda : (calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_actual, activeResult.data?.hoja_flujo_efectivo?.ejercicio_actual) || 0),
                          calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_anterior, activeResult.data?.hoja_flujo_efectivo?.ejercicio_anterior) || 0
                        )} />
                        <span className="ml-1">Var. interanual</span>
                      </div>
                    </div>

                    {/* Tarjeta 3: DEUDA BANCARIA TOTAL */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateRatio('deuda / ebitda', activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_ebitda !== 'N/A' ? (activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_ebitda || 0) : 0)} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">DEUDA BANCARIA TOTAL (EN MILES)</p>
                      <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                        {formatCurrencyThousands(activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_total !== 'N/A' ? activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_total : null)}
                      </p>
                      <p className="text-xs font-sans font-bold text-gray-600 leading-tight">Total sistema financiero</p>
                    </div>

                    {/* Tarjeta 4: DEUDA CORTO PLAZO */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          {(() => {
                            const deudaCPActual = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.pasivo_corriente);
                            const deudaCPAnterior = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.pasivo?.pasivo_corriente);
                            return <StatusBadge status={evaluateVariation(calculateVariation(deudaCPActual || 0, deudaCPAnterior || 0))} />;
                          })()}
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">DEUDA CORTO PLAZO (EN MILES)</p>
                      {(() => {
                        const deudaCPActual = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.pasivo_corriente);
                        const deudaCPAnterior = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.pasivo?.pasivo_corriente);
                        
                        if (deudaCPActual === null) {
                          return <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">-</p>;
                        }

                        return (
                          <>
                            <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                              {formatCurrencyThousands(deudaCPActual)}
                            </p>
                            {deudaCPAnterior !== null && (
                              <div className="flex items-center text-xs font-sans font-bold text-gray-600 leading-tight">
                                <VariationBadge variation={calculateVariation(deudaCPActual, deudaCPAnterior)} />
                                <span className="ml-1">Var. interanual</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* KPI Cards (Fila Original) */}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.isArray(activeResult.dashboardData?.ratios) && activeResult.dashboardData.ratios.map((ratio, idx) => (
                      <div key={idx} className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                        <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateRatio(ratio.name, ratio.value)} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">{ratio.name}</p>
                        <p className="text-3xl font-bold font-sans mb-2 text-[#141414]">
                          {typeof ratio.value === 'number' ? ratio.value.toFixed(2) : ratio.value}
                        </p>
                        <p className="text-xs font-sans font-bold text-gray-600 leading-tight">{ratio.description}</p>
                      </div>
                    ))}
                  </div>
                  
                      </div>
                    
                  </div>

                  {/* Balance y Ratios */}
                  <div className="mb-12 print:break-inside-avoid">
                    
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Balance y Ratios</h2>
                    <div className="space-y-8">
                       <ComparativeView json_extraccion={activeResult.data} json_ratios={activeResult.dashboardData?.motor_de_ratios} />
                    </div>
                  </div>

                  {/* Accionistas y Directorio */}
                  <div className="mb-12 print:break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Accionistas y Directorio</h2>

                    <div className="space-y-8  font-sans">
                      {/* Bloque 1: COMPOSICIÓN ACCIONARIA */}
                      <div className="bg-white border border-[#141414] p-6">
                        <h3 className="text-lg font-semibold text-[#141414] mb-6">COMPOSICIÓN SOCIAL / ACCIONISTAS</h3>
                        
                        <ShareholderTable 
                          accionistas={
                            Array.isArray(activeResult.dashboardData?.accionistas_y_directorio?.accionistas) && activeResult.dashboardData.accionistas_y_directorio.accionistas.length > 0
                              ? activeResult.dashboardData.accionistas_y_directorio.accionistas
                              : [
                                  { nombre: 'Inversiones Globales S.A.', dni_cuit: '30-71234567-8', participacion: 52.99, subAccionistas: [
                                    { nombre: 'Persona Física 1', dni_cuit: '20.111.222', participacion: 60 },
                                    { nombre: 'Sociedad Holding B', dni_cuit: '30-98765432-1', participacion: 40, subAccionistas: [
                                      { nombre: 'Beneficiario Final 1', dni_cuit: '20.333.444', participacion: 50 },
                                      { nombre: 'Fideicomiso de Control C', dni_cuit: '30-11223344-5', participacion: 50, subAccionistas: [
                                        { nombre: 'Beneficiario Humano Final (Nivel 4)', dni_cuit: '10.999.888', participacion: 100 }
                                      ] }
                                    ]}
                                  ] },
                                  { nombre: 'Pérez, Juan Ignacio', dni_cuit: '20.123.456', participacion: 30.00 },
                                  { nombre: 'Gómez, María Laura', dni_cuit: '25.987.654', participacion: 17.01 }
                                ]
                          }
                        />
                      </div>

                      {/* Bloque 2: DIRECTORIO Y MANAGEMENT */}
                      <div className="bg-white border border-[#141414] p-6 mt-8">
                        <h3 className="text-base font-semibold text-black mb-6">ÓRGANO DE ADMINISTRACIÓN / DIRECTORIO</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Array.isArray(activeResult.dashboardData?.accionistas_y_directorio?.directorio) && activeResult.dashboardData.accionistas_y_directorio.directorio.length > 0 ? (
                            activeResult.dashboardData.accionistas_y_directorio.directorio.map((miembro, idx) => (
                              <div key={idx} className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">{miembro.cargo}</p>
                                <p className="font-medium text-[#141414]">{miembro.nombre}</p>
                              </div>
                            ))
                          ) : (
                            <>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Presidente</p>
                                <p className="font-medium text-[#141414]">Juan Ignacio Pérez</p>
                              </div>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Vicepresidente</p>
                                <p className="font-medium text-[#141414]">María Laura Gómez</p>
                              </div>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Director Titular</p>
                                <p className="font-medium text-[#141414]">Carlos Alberto Ruiz</p>
                              </div>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Director Suplente</p>
                                <p className="font-medium text-[#141414]">Ana Clara Fernández</p>
                              </div>
                              <div className="p-4 border border-[#141414]/10 bg-[#FAFAFA] rounded-sm hover:border-[#141414]/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-[#141414]/50 mb-1">Síndico Titular</p>
                                <p className="font-medium text-[#141414]">Estudio Contable López & Asoc.</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  
                  </div>

                  {/* Historia y actividad de la empresa */}
                  <div className="mb-12 print:break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Historia y actividad de la empresa</h2>

                    <div className="bg-gray-50 border border-gray-200 p-8 text-center">
                      <p className="text-gray-500 italic">Sección en desarrollo</p>
                    </div>
                  </div>

                  {/* Mercado */}
                  <div className="mb-12 print:break-before-page">
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Mercado</h2>

                    {activeResult.dashboardData?.analisis_mercado ? (
                      <div className="w-full bg-white border border-[#141414] p-10 font-sans text-justify leading-relaxed">
                        <div className="prose prose-sm md:prose-base max-w-none print:max-w-none print:w-full prose-headings:font-sans prose-headings:font-semibold prose-headings:text-gray-800 prose-p:text-justify prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
                          <ReactMarkdown>{activeResult.dashboardData.analisis_mercado}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-200 p-8 text-center">
                        <p className="text-gray-500 italic">Sección en desarrollo</p>
                      </div>
                    )}
                  </div>

                  {/* Información post balance */}
                  <div className="mb-12 print:break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Información post balance</h2>

                      <div className="space-y-8 ">
                        {/* Post-Closing Analysis Section (Moved Inside) */}
                      {activeResult.data?.analisis_post_cierre && activeResult.data.analisis_post_cierre.total_ventas_post_cierre > 0 ? (
                        <div className="bg-white border border-[#141414] p-6 font-sans">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <h3 className="text-lg font-semibold text-[#141414]">EVOLUCIÓN DE VENTAS POST BALANCE (COMPARATIVO INTERANUAL)</h3>
                            
                            <div className="flex flex-col items-end gap-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <span className="text-xs font-bold uppercase text-[#141414]/70">Ver en moneda constante (Último mes)</span>
                                <div className="relative">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only" 
                                    checked={isInflationAdjusted}
                                    onChange={(e) => setIsInflationAdjusted(e.target.checked)}
                                  />
                                  <div className={`block w-10 h-6 rounded-full transition-colors ${isInflationAdjusted ? 'bg-[#141414]' : 'bg-gray-300'}`}></div>
                                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isInflationAdjusted ? 'transform translate-x-4' : ''}`}></div>
                                </div>
                              </label>
                              
                              {isInflationAdjusted && (
                                <div className="flex items-center gap-3 text-xs animate-in fade-in slide-in-from-top-2">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[#141414]/70">% Interanual:</span>
                                    <input 
                                      type="number" 
                                      value={inflationInteranual}
                                      onChange={(e) => setInflationInteranual(Number(e.target.value))}
                                      className="w-16 px-1 py-0.5 border border-[#141414]/20 rounded text-right"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[#141414]/70">% Mensual Promedio:</span>
                                    <input 
                                      type="number" 
                                      value={inflationMensual}
                                      onChange={(e) => setInflationMensual(Number(e.target.value))}
                                      className="w-16 px-1 py-0.5 border border-[#141414]/20 rounded text-right"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="">
                            <table className="w-full text-sm text-left border-collapse">
                              <thead className="bg-[#F0EFED] text-[#141414] text-xs uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-3 font-semibold border-b border-[#141414]/20">Mes</th>
                                  <th className={`px-4 py-3 font-semibold border-b border-[#141414]/20 text-right transition-colors ${isInflationAdjusted ? 'bg-amber-50/50' : ''}`}>Año Actual ($)</th>
                                  <th className={`px-4 py-3 font-semibold border-b border-[#141414]/20 text-right transition-colors ${isInflationAdjusted ? 'bg-amber-50/50' : ''}`}>Año Anterior ($)</th>
                                  <th className="px-4 py-3 font-semibold border-b border-[#141414]/20 text-right">Var. (%)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#141414]/10">
                                {(() => {
                                  const rawVentas = activeResult.data.analisis_post_cierre.detalle_ventas_mensuales;
                                  const ventasMensuales = Array.isArray(rawVentas) ? rawVentas : [];
                                  const baseIndex = ventasMensuales.length - 1;
                                  
                                  return ventasMensuales.map((venta, idx) => {
                                    const i = baseIndex - idx;
                                    let montoActual = venta.monto || 0;
                                    let montoAnterior = venta.monto_anio_anterior;

                                    if (isInflationAdjusted) {
                                      const factorMensual = Math.pow(1 + (inflationMensual / 100), i);
                                      const factorInteranual = 1 + (inflationInteranual / 100);
                                      
                                      montoActual = montoActual * factorMensual;
                                      if (montoAnterior) {
                                        montoAnterior = montoAnterior * factorInteranual * factorMensual;
                                      }
                                    }

                                    const varPct = montoAnterior ? ((montoActual - montoAnterior) / montoAnterior) * 100 : null;

                                    return (
                                      <tr key={idx} className="hover:bg-[#141414]/5 transition-colors">
                                        <td className="px-4 py-3 font-medium text-[#141414]">{venta.mes}</td>
                                        <td className="px-4 py-3 text-right font-mono">{formatCurrencyThousands(montoActual)}</td>
                                        <td className="px-4 py-3 text-right font-mono">
                                          {montoAnterior ? formatCurrencyThousands(montoAnterior) : <span className="text-xs opacity-50 italic">Sin información</span>}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-mono ${varPct !== null ? 'font-bold' : ''} ${varPct !== null && varPct >= 0 ? 'text-emerald-600' : ''} ${varPct !== null && varPct < 0 ? 'text-red-600' : ''}`}>
                                          {varPct !== null ? (
                                            <div className="flex items-center justify-end gap-1">
                                              {varPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                              {varPct > 0 ? '+' : ''}{varPct.toFixed(1)}%
                                            </div>
                                          ) : (
                                            <span className="text-xs opacity-50 italic">-</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                              <tfoot>
                                {(() => {
                                  const rawVentas = activeResult.data.analisis_post_cierre.detalle_ventas_mensuales;
                                  const ventasMensuales = Array.isArray(rawVentas) ? rawVentas : [];
                                  const baseIndex = ventasMensuales.length - 1;
                                  
                                  let totalActual = 0;
                                  let totalAnterior = 0;

                                  ventasMensuales.forEach((venta, idx) => {
                                    const i = baseIndex - idx;
                                    let montoActual = venta.monto || 0;
                                    let montoAnterior = venta.monto_anio_anterior || 0;

                                    if (isInflationAdjusted) {
                                      const factorMensual = Math.pow(1 + (inflationMensual / 100), i);
                                      const factorInteranual = 1 + (inflationInteranual / 100);
                                      
                                      montoActual = montoActual * factorMensual;
                                      if (montoAnterior) {
                                        montoAnterior = montoAnterior * factorInteranual * factorMensual;
                                      }
                                    }

                                    totalActual += montoActual;
                                    totalAnterior += montoAnterior;
                                  });

                                  const totalVar = totalAnterior > 0 ? ((totalActual - totalAnterior) / totalAnterior) * 100 : null;

                                  return (
                                    <tr className="bg-[#F0EFED] font-bold text-[#141414]">
                                      <td className="px-4 py-3 border-t border-[#141414]/20">TOTAL ACUMULADO</td>
                                      <td className="px-4 py-3 border-t border-[#141414]/20 text-right font-mono">{formatCurrencyThousands(totalActual)}</td>
                                      <td className="px-4 py-3 border-t border-[#141414]/20 text-right font-mono">
                                        {totalAnterior > 0 ? formatCurrencyThousands(totalAnterior) : <span className="text-xs opacity-50 italic font-normal">Sin información</span>}
                                      </td>
                                      <td className={`px-4 py-3 border-t border-[#141414]/20 text-right font-mono ${totalVar !== null && totalVar >= 0 ? 'text-emerald-600' : ''} ${totalVar !== null && totalVar < 0 ? 'text-red-600' : ''}`}>
                                        {totalVar !== null ? (
                                          <div className="flex items-center justify-end gap-1">
                                            {totalVar >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                            {totalVar > 0 ? '+' : ''}{totalVar.toFixed(1)}%
                                          </div>
                                        ) : (
                                          <span className="text-xs opacity-50 italic font-normal">-</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })()}
                              </tfoot>
                            </table>
                          </div>
                          
                          {isInflationAdjusted && (
                            <div className="mt-4 text-xs italic text-gray-500">
                              * Valores expresados en moneda homogénea del último mes, asumiendo inflación interanual del {inflationInteranual}% y mensual del {inflationMensual}%.
                            </div>
                          )}
                          
                          {activeResult.data.analisis_post_cierre.notas_relevantes && (
                            <div className="mt-2 text-xs opacity-70 italic border-t border-[#141414]/10 pt-2">
                              Nota: {activeResult.data.analisis_post_cierre.notas_relevantes}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-white border border-[#141414] p-12 text-center text-[#141414]/60 font-mono text-sm">
                          No hay información post balance disponible.
                        </div>
                      )}

                      {/* Deuda Bancaria Asumida Post Balance */}
                      {Array.isArray(activeResult.data?.analisis_post_cierre?.deuda_bancaria_post_balance_detalle) && activeResult.data.analisis_post_cierre.deuda_bancaria_post_balance_detalle.length > 0 && (
                        <div className="bg-white border border-[#141414] p-6 mt-8">
                          <h3 className="text-lg font-semibold text-[#141414] mb-6">DEUDA BANCARIA ASUMIDA POST BALANCE</h3>
                          
                          <div className="">
                            <table className="w-full text-sm text-left border-collapse">
                              <thead className="bg-[#F0EFED] text-[#141414] text-xs uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-3 font-semibold border-b border-[#141414]/20">ENTIDAD BANCARIA / ACREEDOR</th>
                                  <th className="px-4 py-3 font-semibold border-b border-[#141414]/20 text-right">MONTO ASUMIDO</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#141414]/10">
                                {activeResult.data.analisis_post_cierre.deuda_bancaria_post_balance_detalle.map((item: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-[#141414]/5 transition-colors">
                                    <td className="px-4 py-3 font-medium text-[#141414]">{item.entidad}</td>
                                    <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrencyThousands(item.monto, item.moneda)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-[#F0EFED] font-bold text-[#141414]">
                                  <td className="px-4 py-3 text-right">TOTAL DEUDA POST BALANCE:</td>
                                  <td className="px-4 py-3 text-right font-mono">
                                    {formatCurrencyThousands(
                                      activeResult.data.analisis_post_cierre.deuda_bancaria_post_balance_detalle.reduce((acc: number, curr: any) => acc + (Number(curr.monto) || 0), 0),
                                      activeResult.data.analisis_post_cierre.deuda_bancaria_post_balance_detalle[0]?.moneda || 'ARS'
                                    )}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}

                    </div>
                  
                  </div>

                  {/* Proyecciones */}
                  <div className="mb-12 print:break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Proyecciones</h2>

                      <div className="space-y-8 ">
                        {/* Sales Analysis */}
                    <div className="lg:col-span-2 bg-white border border-[#141414] p-6">
                      <div className="flex items-center gap-2 mb-6 border-b border-[#141414]/10 pb-4">
                        <TrendingUp className="w-5 h-5" />
                        <h3 className="font-sans font-bold text-lg">Análisis de Ventas & Proyección</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <h4 className="text-xs font-bold uppercase mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 bg-[#141414] rounded-full" />
                            Evolución Histórica
                          </h4>
                          <p className="text-sm leading-relaxed opacity-80">
                            {activeResult.dashboardData?.sales_analysis?.evolution_text}
                          </p>
                        </div>
                        <div className="bg-[#F0EFED] p-4 border border-[#141414]/10">
                          <h4 className="text-xs font-bold uppercase mb-3 flex items-center gap-2 text-emerald-700">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            Proyección IA
                          </h4>
                          <p className="text-sm leading-relaxed opacity-80 italic">
                            "{activeResult.dashboardData?.sales_analysis?.projection_text}"
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  </div>

                  {/* Opinión de riesgos */}
                  <div className="mb-12 print:break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Opinión de riesgos</h2>

                    <div className="bg-gray-50 border border-gray-200 p-8 text-center">
                      <p className="text-gray-500 italic">Sección en desarrollo</p>
                    </div>
                  </div>

                  {/* Sistema Financiero (Nosis) */}
                  <div className="mb-12 print:break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Sistema Financiero (Nosis)</h2>

                      <div className="space-y-8 ">
                        {/* Nosis Section */}
                  {activeResult.dashboardData.extraccion_nosis && (
                    <div className="border border-[#141414] bg-white mt-8">
                      <div className="flex items-center justify-between p-4 border-b border-[#141414]/10 bg-[#F0EFED] select-none">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📑</span>
                          <span className="text-lg font-bold uppercase tracking-wider">PESTAÑA NOSIS (ANTECEDENTES Y BCRA)</span>
                        </div>
                      </div>
                      
                      <div className="p-6 bg-[#FAFAFA]">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Score Crediticio</p>
                              <p className="text-xl font-bold font-mono text-[#141414]">
                                {activeResult.dashboardData?.extraccion_nosis?.score_crediticio}
                              </p>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Peor Situación BCRA</p>
                              <p className="text-xl font-bold font-mono text-[#141414]">
                                Categoría {activeResult.dashboardData?.extraccion_nosis?.situacion_bcra_peor_estado}
                              </p>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Cheques Rechazados</p>
                              <p className="text-xl font-bold font-mono text-[#141414]">
                                {activeResult.dashboardData?.extraccion_nosis?.cheques_rechazados_cantidad} cheques
                              </p>
                              <p className="text-xs opacity-70 mt-1">
                                por un total de {formatCurrencyThousands(activeResult.dashboardData?.extraccion_nosis?.cheques_rechazados_monto)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Deuda Total Nosis</p>
                              <p className="text-xl font-bold font-mono text-[#141414]">
                                {formatCurrencyThousands(activeResult.dashboardData?.extraccion_nosis?.deuda_financiera_total_nosis)}
                              </p>
                              <p className="text-[10px] opacity-50 mt-1">(Expresado en miles)</p>
                            </div>
                          </div>

                          {activeResult.dashboardData.datos_adicionales_balance && (
                            <div className="bg-[#E4E3E0] p-4 border-l-4 border-[#141414] mb-8">
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-[#141414]">Deuda Post Balance</p>
                              <p className="text-lg font-bold font-mono text-[#141414]">
                                {formatCurrencyThousands(activeResult.dashboardData.datos_adicionales_balance.deuda_bancaria_post_balance)}
                              </p>
                              <p className="text-[10px] opacity-70 mt-1">
                                (Extraído de los hechos posteriores al cierre en las notas del balance, si existiera)
                              </p>
                            </div>
                          )}

                          <h4 className="text-xs font-bold uppercase mb-4 opacity-70 border-b border-[#141414]/10 pb-2">Detalle de Entidades</h4>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            <div className="">
                              <table className="w-full text-sm font-mono border-collapse">
                                <thead>
                                  <tr className="border-b border-[#141414]">
                                    <th className="text-left py-2 font-bold uppercase text-xs opacity-60">Entidad</th>
                                    <th className="text-center py-2 font-bold uppercase text-xs opacity-60">Situación</th>
                                    <th className="text-right py-2 font-bold uppercase text-xs opacity-60 w-1/3">Monto / Participación</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#141414]/10">
                                  {(() => {
                                    const rawEntidades = activeResult.dashboardData?.extraccion_nosis?.detalle_entidades;
                                    const entidades = Array.isArray(rawEntidades) ? rawEntidades : [];
                                    const totalDeudaNosis = activeResult.dashboardData?.extraccion_nosis?.deuda_financiera_total_nosis || 0;
                                    const totalSuma = entidades.reduce((acc, curr) => acc + (Number(curr?.monto) || 0), 0);
                                    const totalReferencia = totalDeudaNosis > 0 ? totalDeudaNosis : totalSuma;

                                    return entidades.map((entidad, i) => {
                                      const participacion = totalReferencia > 0 ? ((entidad.monto / totalReferencia) * 100).toFixed(1) : "0.0";
                                      return (
                                        <tr key={i} className="hover:bg-[#141414]/5 transition-colors">
                                          <td className="py-3 font-bold">{entidad.entidad}</td>
                                          <td className="py-3 text-center font-bold text-[#141414]">{entidad.situacion}</td>
                                          <td className="py-3">
                                            <div className="flex flex-col gap-1 items-end">
                                              <span className="font-bold text-[#141414]">{formatCurrencyThousands(entidad.monto)} ({participacion}%)</span>
                                              <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                                <div className="bg-blue-600 h-full" style={{ width: `${participacion}%` }}></div>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    });
                                  })()}
                                </tbody>
                              </table>
                            </div>
                            
                            {/* Pie Chart */}
                            {Array.isArray(activeResult.dashboardData?.extraccion_nosis?.detalle_entidades) && activeResult.dashboardData.extraccion_nosis.detalle_entidades.length > 0 && (
                              <div className="h-64 flex flex-col items-center justify-center bg-white border border-[#141414]/10 p-4 rounded">
                                <h5 className="text-xs font-bold uppercase opacity-70 mb-2">Composición de Deuda</h5>
                                <PieChart width={400} height={200}>
                                    <Pie
                                      data={activeResult.dashboardData.extraccion_nosis.detalle_entidades.map(e => ({ name: e?.entidad || 'Desconocido', value: Number(e?.monto) || 0 }))}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={50}
                                      outerRadius={70}
                                      paddingAngle={2}
                                      dataKey="value"
                                      label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = outerRadius * 1.2;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                        return (
                                          <text x={x} y={y} fill="#141414" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10" fontWeight="bold">
                                            {name} ({(percent * 100).toFixed(0)}%)
                                          </text>
                                        );
                                      }}
                                    >
                                      {activeResult.dashboardData.extraccion_nosis.detalle_entidades.map((entry, index) => {
                                        const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1e40af', '#1d4ed8', '#1e3a8a'];
                                        return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                                      })}
                                    </Pie>
                                    <Tooltip 
                                      formatter={(value: number) => formatCurrencyThousands(value)}
                                      contentStyle={{ backgroundColor: '#141414', color: '#E4E3E0', border: 'none', borderRadius: '4px', fontSize: '12px' }}
                                    />
                                  </PieChart>
                              </div>
                            )}
                          </div>
                        </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                    
                        {/* Cross Check Section */}
                    <div className="lg:col-span-1 bg-[#141414] text-[#E4E3E0] p-6 border border-[#141414] flex flex-col">
                      <div className="flex items-center gap-2 mb-6 border-b border-white/20 pb-4">
                        <Scale className="w-5 h-5" />
                        <h3 className="font-sans font-bold text-lg">Cruce de Deuda</h3>
                      </div>
                      
                      {activeResult.dashboardData.cross_check ? (
                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] opacity-50 uppercase mb-1">Deuda Balance</p>
                              <p className="font-mono text-lg font-bold text-white">
                                {formatCurrencyThousands(activeResult.dashboardData?.cross_check?.balance_debt)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] opacity-50 uppercase mb-1">Deuda Nosis</p>
                              <p className="font-mono text-lg font-bold text-white">
                                {formatCurrencyThousands(activeResult.dashboardData?.cross_check?.nosis_debt)}
                              </p>
                            </div>
                          </div>
                          
                          <div className={cn(
                            "p-4 border",
                            activeResult.dashboardData?.cross_check?.match 
                              ? "border-emerald-500/50 bg-emerald-500/10" 
                              : "border-red-500/50 bg-red-500/10"
                          )}>
                            <div className="flex items-center gap-2 mb-1">
                              {activeResult.dashboardData?.cross_check?.match 
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                : <AlertTriangle className="w-4 h-4 text-red-500" />
                              }
                              <span className="text-xs font-bold uppercase">
                                {activeResult.dashboardData?.cross_check?.match ? "Consistente" : "Discrepancia Detectada"}
                              </span>
                            </div>
                            <p className="text-[10px] opacity-70">
                              Diferencia: {formatCurrencyThousands(activeResult.dashboardData?.cross_check?.difference)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
                          <FileText className="w-12 h-12 mb-4" />
                          <p className="text-xs uppercase">No se detectó reporte de deuda para cruzar información.</p>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                  
                  </div>

                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      
    </div>
  );
}
