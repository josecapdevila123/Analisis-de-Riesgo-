/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ComparativeView, Table, getComparativeTablesData, formatValue, getVariationText } from './components/ComparativeView';
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
  Sparkles,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Scale,
  AlertTriangle,
  X,
  ChevronRight,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  CornerDownRight,
  Pencil,
  Save
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import { cn, formatCurrencyThousands } from './lib/utils';
import { generatePDF } from './features/pdf/generatePDF';
import { ACCEPT_PLANILLAS, esPlanilla, leerArchivo, planillaATexto } from './lib/planillas';
import type { UploadedFile } from './features/extraction/geminiClient';
import { runPipeline, CaseState } from './features/extraction/pipeline';
import { useAuth } from './features/auth/useAuth';
import { useCases } from './features/cases/useCases';
import { ExtractionResult, Shareholder } from './types';
import { RatioKey, RatioStatus, computeRatios, disponibilidadesActuales } from './features/ratios/calculations';
import { runSanityChecks } from './features/ratios/sanityChecks';
import { runCrossCheck } from './features/ratios/crossCheck';
import { RawExtraction } from './features/extraction/schemas';
import {
  EditProvider,
  EditableNumber,
  EditableText,
  EditableSelect,
  EditableBoolean,
  AddRowButton,
  RemoveRowButton,
  Path,
  setIn,
  useEdit,
} from './features/editing/editing';
import { SourceDataEditor } from './features/editing/SourceDataEditor';
import { BiBankLogo } from './components/BiBankLogo';
import { CompanyHistoryView } from './components/CompanyHistoryView';
import { NosisDebtBars } from './components/NosisDebtBars';
import { ExecutiveSummaryView } from './components/ExecutiveSummaryView';
import { BalanceRatiosView } from './components/BalanceRatiosView';
import { ProyeccionesView } from './components/ProyeccionesView';
import { ProyeccionesGuardadas } from './features/projections/types';
import { RATIO_BLOCKS as SHARED_RATIO_BLOCKS } from './features/ratios/blocks';
import { RiskOpinionView } from './components/RiskOpinionView';
import { SistemaFinancieroView } from './components/SistemaFinancieroView';
import { AccionistasView } from './components/AccionistasView';
import { PostBalanceView } from './components/PostBalanceView';
import { AnalysisFlow } from './components/AnalysisFlow';
import { RiskPolicyView } from './components/RiskPolicyView';
import { runRiskAssessment } from './features/risk/assessment';
import { confirmarRubro, estadoPorton, perfilDelCaso, sectorInicial } from './features/risk/porton';
import { RubroDisponible, SECTOR_PROFILES, SubSegmento, TipoDocumento } from './features/risk/policy';
import { PreChequeo } from './components/PreChequeo';
import { armarPrechequeo } from './features/risk/prechequeo';
import { indicadoresFinancieros } from './features/ratios/financieras';
import { DocumentoSectorial, ExtraccionDocumento, fechaDeExtraccion, MAX_DOCUMENTOS_POR_CASO } from './features/sectorDocs/tipos';
import { runFinancialBlockExtraction, runSectorDocExtraction } from './features/extraction/geminiClient';
import { SectorBanner } from './components/SectorBanner';
import { PerfilAviso } from './components/PerfilAviso';
import { HistorialEmpresas } from './components/HistorialEmpresas';
import { stripRiskConclusion } from './features/risk/summary';
import { CATEGORY_LABEL } from './features/risk/score';

const ShareholderTable = ({ accionistas, level = 1, parentName = '', basePath }: { accionistas: Shareholder[], level?: number, parentName?: string, basePath?: Path }) => {
  const { editing } = useEdit();
  const canEdit = editing && !!basePath;
  if (!accionistas || (accionistas.length === 0 && !canEdit)) return null;
  const rowPath = (idx: number, field: string): Path => [...(basePath ?? []), idx, field];

  return (
    <div className={`${level > 1 ? 'mt-8 mb-8 ml-4 md:ml-8 print:break-inside-avoid' : ''}`}>
      {level > 1 && (
        <div className="flex items-center gap-2 mb-3 text-ink">
          <CornerDownRight className="w-4 h-4 opacity-50" />
          <h4 className="text-sm font-semibold">↳ Composición de {parentName}</h4>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className={`${level === 1 ? 'bg-canvas' : 'bg-slate-50'} text-ink text-xs uppercase tracking-wider`}>
            <tr>
              <th className="px-4 py-3 font-semibold border-b border-ink/20">Apellido y Nombre / Razón Social</th>
              <th className="px-4 py-3 font-semibold border-b border-ink/20">DNI / CUIT</th>
              <th className="px-4 py-3 font-semibold border-b border-ink/20 w-1/3">% Participación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {accionistas.map((accionista, idx) => {
              const participacionNum = Number(accionista.participacion) || 0;
              return (
                <tr key={idx} className="hover:bg-ink/5 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">
                    {canEdit ? (
                      <div className="flex items-center gap-1">
                        <RemoveRowButton path={basePath!} list={accionistas} index={idx} />
                        <EditableText path={rowPath(idx, 'nombre')} value={accionista.nombre} />
                      </div>
                    ) : accionista.nombre}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {canEdit ? <EditableText path={rowPath(idx, 'dni_cuit')} value={accionista.dni_cuit} /> : accionista.dni_cuit}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {canEdit ? (
                        <span className="flex items-center gap-1">
                          <EditableNumber path={rowPath(idx, 'participacion')} value={accionista.participacion} inputClassName="w-20" />%
                        </span>
                      ) : (
                        <span className="font-bold text-ink">{participacionNum}%</span>
                      )}
                      <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-ink h-full" style={{ width: `${participacionNum}%` }}></div>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={`${level === 1 ? 'bg-canvas' : 'bg-slate-50'} font-bold text-ink`}>
              <td className="px-4 py-3 border-t border-ink/20" colSpan={2}>TOTAL</td>
              <td className="px-4 py-3 border-t border-ink/20">
                {accionistas.reduce((sum, a) => sum + (Number(a.participacion) || 0), 0).toFixed(2)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {canEdit && (
        <div className="flex gap-4">
          <AddRowButton path={basePath!} list={accionistas} newItem={{ nombre: '', dni_cuit: '', participacion: null }} label="Agregar accionista" />
        </div>
      )}
      {accionistas.map((accionista, idx) => (
        accionista.subAccionistas && accionista.subAccionistas.length > 0 ? (
          <ShareholderTable 
            key={`sub-${idx}`} 
            accionistas={accionista.subAccionistas} 
            level={level + 1} 
            parentName={accionista.nombre} 
            basePath={basePath ? [...basePath, idx, 'subAccionistas'] : undefined}
          />
        ) : canEdit ? (
          <div key={`sub-${idx}`} className="ml-4 md:ml-8">
            <AddRowButton
              path={[...basePath!, idx, 'subAccionistas']}
              list={[]}
              newItem={{ nombre: '', dni_cuit: '', participacion: null }}
              label={`Agregar composición de ${accionista.nombre && accionista.nombre !== 'N/A' ? accionista.nombre : 'este accionista'}`}
            />
          </div>
        ) : null
      ))}
    </div>
  );
};
export default function App() {
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('Resumen Ejecutivo');
  // Barra lateral abierta o contraída; se recuerda en este navegador.
  const [isHistorySidebarOpen, setIsHistorySidebarOpenState] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebarAbierta') !== 'false'; } catch { return true; }
  });
  const setIsHistorySidebarOpen = (open: boolean) => {
    setIsHistorySidebarOpenState(open);
    try { localStorage.setItem('sidebarAbierta', String(open)); } catch { /* sin almacenamiento: no pasa nada */ }
  };
  const [isInflationAdjusted, setIsInflationAdjusted] = useState(false);
  const [inflationInteranual, setInflationInteranual] = useState(60);
  const [inflationMensual, setInflationMensual] = useState(3);

  const TABS = [
    "Resumen Ejecutivo",
    "Balance y Ratios",
    "Sistema Financiero (Nosis)",
    "Accionistas y Directorio",
    "Historia y actividad de la empresa",
    "Mercado",
    "Información post balance",
    "Proyecciones",
    "Opinión de riesgos"
  ];
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<CaseState | null>(null);
  const [marketAnalysisBusyId, setMarketAnalysisBusyId] = useState<string | null>(null);
  const [companyHistoryBusyId, setCompanyHistoryBusyId] = useState<string | null>(null);
  const [riskBusyId, setRiskBusyId] = useState<string | null>(null);
  const [showPolicy, setShowPolicy] = useState(false);
  // Proyecciones: se actualizan en vivo y se guardan en el caso con un retardo
  // corto (no se escribe en Firestore por cada tecla).
  const proyeccionesTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentFiles, setCurrentFiles] = useState<UploadedFile[]>([]);
  const { user, isAuthReady, handleLogin, handleLogout } = useAuth(() => {
    setActiveResultId(null);
    setCurrentFiles([]);
  });
  const {
    results,
    setResults,
    saveCaseProcessing,
    saveCaseCompleted,
    saveCaseMarketAnalysis,
    saveCaseCompanyHistory,
    saveCaseRiskAssessment,
    saveCaseProyecciones,
    saveCaseSector,
    saveCaseDocumentos,
    saveCaseEdits,
    saveCaseError,
    removeCase,
  } = useCases(user, isAuthReady);

  // Primer nombre de la cuenta de Google; si no tiene, la parte del mail antes de la @.
  const nombreUsuario = (() => {
    const crudo = user?.displayName?.trim().split(/\s+/)[0] || user?.email?.split('@')[0];
    return crudo ? crudo.charAt(0).toUpperCase() + crudo.slice(1).toLowerCase() : null;
  })();

  const storedResult = results.find(r => r.id === activeResultId);

  // Modo edición: el borrador reemplaza la extracción y todo lo derivado
  // (ratios, sanity checks, cruce Nosis) se recalcula en vivo.
  const [draft, setDraft] = useState<{ id: string; extraction: RawExtraction } | null>(null);
  const [isSavingEdits, setIsSavingEdits] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const isEditing = !!draft && draft.id === activeResultId;

  useEffect(() => {
    setDraft(null);
    setEditError(null);
    setShowPolicy(false);
  }, [activeResultId]);

  // Rubro del caso (portón) y perfil con el que se muestra: la foto de la
  // opinión vigente, el del rubro confirmado o, sin confirmar, el genérico.
  const sectorActivo = useMemo(
    () => storedResult?.sector ?? (storedResult?.extraction ? sectorInicial(storedResult.extraction) : null),
    [storedResult?.sector, storedResult?.extraction],
  );
  const perfilVista = useMemo(
    () => perfilDelCaso(sectorActivo, storedResult?.riskAssessment),
    [sectorActivo, storedResult?.riskAssessment],
  );
  const documentosActivos = useMemo(() => storedResult?.documentosSectoriales ?? [], [storedResult?.documentosSectoriales]);
  const porton = estadoPorton(sectorActivo, storedResult?.riskAssessment, documentosActivos);

  const activeResult = useMemo<ExtractionResult | undefined>(() => {
    if (!storedResult) return storedResult;
    const extraction = isEditing && draft ? draft.extraction : storedResult.extraction;
    if (!extraction) return storedResult;
    try {
      return {
        ...storedResult,
        extraction,
        sector: sectorActivo,
        ratios: computeRatios(extraction, perfilVista, documentosActivos.filter(d => d.estado === 'ok')),
        inconsistencias: runSanityChecks(extraction),
        crossCheck: runCrossCheck(extraction),
      };
    } catch (err) {
      console.error('Recálculo de ratios falló:', err);
      return { ...storedResult, extraction };
    }
  }, [storedResult, isEditing, draft, perfilVista, sectorActivo, documentosActivos]);

  // Pre-chequeo antes de la opinión (todos los rubros), con el rubro confirmado.
  const prechequeo = useMemo(
    () => (porton.rubroConfirmado && activeResult?.extraction
      ? armarPrechequeo({
          extraction: activeResult.extraction, ratios: activeResult.ratios, crossCheck: activeResult.crossCheck,
          inconsistencias: activeResult.inconsistencias, documentos: documentosActivos, fechaCaso: activeResult.timestamp, perfil: perfilVista,
        })
      : null),
    [porton.rubroConfirmado, activeResult, documentosActivos, perfilVista],
  );

  const startEditing = () => {
    if (!storedResult?.extraction) return;
    setEditError(null);
    setDraft({ id: storedResult.id, extraction: structuredClone(storedResult.extraction) });
  };

  const cancelEditing = () => {
    setDraft(null);
    setEditError(null);
  };

  const updateDraft = useCallback((path: Path, value: unknown) => {
    setDraft(prev => {
      if (!prev) return prev;
      let next = setIn(prev.extraction, path, value);
      // Si no había información complementaria (casos viejos), nace con todos los campos.
      if (path[0] === 'informacion_complementaria') {
        next = {
          ...next,
          informacion_complementaria: {
            balance_ajustado_por_inflacion: null,
            opinion_auditor: null,
            detalle_opinion_auditor: null,
            deuda_financiera_moneda_extranjera: null,
            porcentaje_ventas_exportacion: null,
            ...(next.informacion_complementaria ?? {}),
          },
        };
      }
      // Si no había accionistas/directorio extraídos, el objeto nace con ambas listas.
      if (path[0] === 'accionistas_y_directorio') {
        next = {
          ...next,
          accionistas_y_directorio: {
            accionistas: next.accionistas_y_directorio?.accionistas ?? [],
            directorio: next.accionistas_y_directorio?.directorio ?? [],
          },
        };
      }
      // El total de ventas post cierre sigue a la suma de los meses cuando se editan.
      if (path[0] === 'analisis_post_cierre' && path[1] === 'detalle_ventas_mensuales' && next.analisis_post_cierre) {
        const total = next.analisis_post_cierre.detalle_ventas_mensuales
          .reduce((acc, v) => acc + (Number(v.monto) || 0), 0);
        next = setIn(next, ['analisis_post_cierre', 'total_ventas_post_cierre'], total);
      }
      return { ...prev, extraction: next };
    });
  }, []);

  const saveEdits = async () => {
    if (!activeResult || !isEditing) return;
    setIsSavingEdits(true);
    setEditError(null);
    const editedAt = new Date().toISOString();
    const edits = {
      extraction: activeResult.extraction,
      ratios: activeResult.ratios,
      inconsistencias: activeResult.inconsistencias,
      crossCheck: activeResult.crossCheck,
    };
    try {
      await saveCaseEdits(activeResult.id, edits, editedAt);
      setResults(prev => prev.map(r => r.id === activeResult.id ? { ...r, ...edits, editedAt } : r));
      setDraft(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingEdits(false);
    }
  };

  const editContext = useMemo(() => ({ editing: isEditing, update: updateDraft }), [isEditing, updateDraft]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      // Excel / CSV: se convierten a texto en el navegador (Gemini no los lee como archivo).
      if (esPlanilla(file)) {
        planillaATexto(file)
          .then(texto => setCurrentFiles(prev => [...prev, { file, preview: '', texto }]))
          .catch(err => alert(`No se pudo leer la planilla "${file.name}": ${err instanceof Error ? err.message : String(err)}`));
        return;
      }
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
      'application/pdf': ['.pdf'],
      ...ACCEPT_PLANILLAS,
    },
    multiple: true
  });

  const removeFile = (index: number) => {
    setCurrentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processFiles = async () => {
    if (currentFiles.length === 0) return;

    setIsProcessing(true);
    setProcessingStage('processing');
    const newId = crypto.randomUUID();
    archivosSesion.current.set(newId, currentFiles);
    const newResult: ExtractionResult = {
      id: newId,
      timestamp: new Date().toISOString(),
      fileNames: currentFiles.map(f => f.file.name),
      schemaVersion: 2,
      status: 'processing',
      extraction: null,
      ratios: null,
      inconsistencias: [],
      crossCheck: null,
      verification: null,
      marketAnalysis: null,
      companyHistory: null,
      riskAssessment: null,
      proyecciones: null,
    };

    setResults(prev => [newResult, ...prev]);
    setActiveResultId(newId);
    setMarketAnalysisBusyId(newId);
    setCompanyHistoryBusyId(newId);
    const clearBusy = () => {
      setMarketAnalysisBusyId(curr => (curr === newId ? null : curr));
      setCompanyHistoryBusyId(curr => (curr === newId ? null : curr));
    };

    try {
      await saveCaseProcessing(newResult);

      const pipelineResult = await runPipeline(currentFiles, {
        onStateChange: (state) => setProcessingStage(state),
        onMarketAnalysis: (text, err) => {
          setMarketAnalysisBusyId(curr => (curr === newId ? null : curr));
          if (err) {
            console.error('Market analysis failed:', err);
            return;
          }
          setResults(prev => prev.map(r => r.id === newId ? { ...r, marketAnalysis: text } : r));
          saveCaseMarketAnalysis(newId, text);
        },
        onCompanyHistory: (history, err) => {
          setCompanyHistoryBusyId(curr => (curr === newId ? null : curr));
          if (err) {
            console.error('Company history failed:', err);
            return;
          }
          setResults(prev => prev.map(r => r.id === newId ? { ...r, companyHistory: history } : r));
          saveCaseCompanyHistory(newId, history);
        },
      });

      if (pipelineResult.state === 'error') {
        // Si falla la extracción, mercado e historia nunca se lanzan.
        clearBusy();
        setResults(prev => prev.map(r =>
          r.id === newId ? { ...r, status: 'error', error: pipelineResult.failure?.message } : r
        ));
        await saveCaseError(newId, pipelineResult.failure?.message ?? 'Error desconocido');
        return;
      }

      setResults(prev => prev.map(r =>
        r.id === newId ? {
          ...r,
          status: pipelineResult.state === 'completed' || pipelineResult.state === 'completed_partial'
            ? pipelineResult.state
            : 'completed',
          extraction: pipelineResult.extraction,
          ratios: pipelineResult.ratios,
          inconsistencias: pipelineResult.inconsistencias,
          crossCheck: pipelineResult.crossCheck,
          verification: pipelineResult.verification,
          // Rubro sugerido; queda sin confirmar hasta que el analista lo confirme.
          sector: pipelineResult.extraction ? sectorInicial(pipelineResult.extraction) : null,
        } : r
      ));

      await saveCaseCompleted(newResult, pipelineResult);
    } catch (error) {
      console.error("Pipeline error:", error);
      setResults(prev => prev.map(r =>
        r.id === newId ? { ...r, status: 'error', error: (error as Error).message } : r
      ));
      await saveCaseError(newId, (error as Error).message);
      clearBusy();
    } finally {
      setIsProcessing(false);
      setProcessingStage(null);
    }
  };

  // Último paso, a pedido del analista: genera o regenera la opinión de riesgo
  // con los datos ya guardados del caso y el rubro confirmado (no necesita los archivos).
  const generateRiskAssessment = async (result: ExtractionResult) => {
    const sector = result.sector ?? (result.extraction ? sectorInicial(result.extraction) : null);
    if (!result.extraction || !sector?.confirmado) return;
    setRiskBusyId(result.id);
    try {
      const assessment = await runRiskAssessment({
        extraction: result.extraction,
        inconsistencias: result.inconsistencias,
        crossCheck: result.crossCheck,
        verification: result.verification,
        marketAnalysis: result.marketAnalysis,
        companyHistory: result.companyHistory,
        sector,
        documentos: result.documentosSectoriales ?? [],
      });
      setResults(prev => prev.map(r => r.id === result.id ? { ...r, riskAssessment: assessment } : r));
      await saveCaseRiskAssessment(result.id, assessment);
    } catch (err) {
      console.error('Risk assessment failed:', err);
      alert(`No se pudo generar la opinión de riesgo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRiskBusyId(curr => (curr === result.id ? null : curr));
    }
  };

  // Portón: el analista confirma (o cambia) el rubro del caso.
  const confirmSector = (result: ExtractionResult, rubro: RubroDisponible, motivo: string, nota: string, subsegmento: SubSegmento | null) => {
    const base = result.sector ?? (result.extraction ? sectorInicial(result.extraction) : null);
    if (!base) return;
    try {
      const sector = confirmarRubro(base, rubro, motivo, nota, user?.email ?? null, new Date(), subsegmento);
      setResults(prev => prev.map(r => (r.id === result.id ? { ...r, sector } : r)));
      saveCaseSector(result.id, sector);
      if (SECTOR_PROFILES[rubro].modelo === 'financiera' && !result.extraction?.extraccion_financiera && archivosSesion.current.has(result.id)) {
        extraerBloqueFinanciero(result, null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // ---------- Documentos sectoriales (declarados por el cliente) ----------
  const [extrayendoBloqueId, setExtrayendoBloqueId] = useState<string | null>(null);
  // Archivos subidos en esta sesión, por caso (solo en memoria: se pierden al
  // recargar). Permiten extraer el bloque financiero sin volver a subir el balance.
  const archivosSesion = useRef(new Map<string, UploadedFile[]>());

  // Lista vigente de documentos por caso, fuera del ciclo de render: así la
  // lista que se guarda es siempre la misma que se muestra (nunca una vacía).
  const documentosRef = useRef(new Map<string, DocumentoSectorial[]>());
  const guardarDocumentos = (id: string, actualizar: (docs: DocumentoSectorial[]) => DocumentoSectorial[]) => {
    const actuales = documentosRef.current.get(id) ?? results.find(r => r.id === id)?.documentosSectoriales ?? [];
    const nuevos = actualizar(actuales);
    documentosRef.current.set(id, nuevos);
    setResults(prev => prev.map(r => (r.id === id ? { ...r, documentosSectoriales: nuevos } : r)));
    // Lo que queda "procesando" no se guarda: si se cierra la app, no queda colgado.
    saveCaseDocumentos(id, nuevos.filter(d => d.estado !== 'procesando'));
  };

  const cargarDocumento = async (result: ExtractionResult, tipo: TipoDocumento, file: File) => {
    if ((result.documentosSectoriales ?? []).length >= MAX_DOCUMENTOS_POR_CASO) {
      alert(`Máximo ${MAX_DOCUMENTOS_POR_CASO} documentos por caso.`);
      return;
    }
    const ahora = new Date().toISOString();
    const doc: DocumentoSectorial = {
      id: crypto.randomUUID(), tipo, nombreArchivo: file.name, fechaDocumento: null, cargadoPor: user?.email ?? null,
      cargadoEn: ahora, actualizadoEn: ahora, extraccion: null, estado: 'procesando', editado: false,
    };
    guardarDocumentos(result.id, docs => [...docs, doc]);
    try {
      const extraccion = await runSectorDocExtraction(tipo, [await leerArchivo(file)]);
      const fecha = fechaDeExtraccion(extraccion);
      guardarDocumentos(result.id, docs => docs.map(d => d.id === doc.id ? { ...d, extraccion, fechaDocumento: fecha, estado: 'ok', actualizadoEn: new Date().toISOString() } : d));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      guardarDocumentos(result.id, docs => docs.map(d => d.id === doc.id ? { ...d, estado: 'error', error } : d));
    }
  };

  const editarDocumento = (result: ExtractionResult, docId: string, extraccion: ExtraccionDocumento) => {
    guardarDocumentos(result.id, docs => docs.map(d => d.id === docId ? {
      ...d, extraccion, editado: true, actualizadoEn: new Date().toISOString(),
      fechaDocumento: fechaDeExtraccion(extraccion) ?? d.fechaDocumento,
    } : d));
  };

  const borrarDocumento = (result: ExtractionResult, docId: string) => {
    if (!confirm('¿Borrar el documento? Si ya hay opinión, queda desactualizada.')) return;
    guardarDocumentos(result.id, docs => docs.filter(d => d.id !== docId));
  };

  // Bloque financiero de los EECC a demanda: la app no guarda los archivos, así
  // que se vuelve a subir el balance y se lee solo ese bloque.
  // files = null: usa el balance que se subió en esta sesión.
  const extraerBloqueFinanciero = async (result: ExtractionResult, files: File[] | null) => {
    if (!result.extraction) return;
    const enSesion = archivosSesion.current.get(result.id);
    if (!files && !enSesion) return;
    setExtrayendoBloqueId(result.id);
    try {
      const bloque = await runFinancialBlockExtraction(files ? await Promise.all(files.map(leerArchivo)) : enSesion!);
      const extraction = { ...result.extraction, extraccion_financiera: bloque };
      const editedAt = new Date().toISOString();
      const edits = { extraction, ratios: computeRatios(extraction), inconsistencias: runSanityChecks(extraction), crossCheck: runCrossCheck(extraction) };
      await saveCaseEdits(result.id, edits, editedAt);
      setResults(prev => prev.map(r => r.id === result.id ? { ...r, ...edits, editedAt } : r));
    } catch (err) {
      alert(`No se pudo extraer el bloque financiero: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExtrayendoBloqueId(curr => (curr === result.id ? null : curr));
    }
  };

  const updateProyecciones = (id: string, next: ProyeccionesGuardadas) => {
    setResults(prev => prev.map(r => (r.id === id ? { ...r, proyecciones: next } : r)));
    if (proyeccionesTimer.current) clearTimeout(proyeccionesTimer.current);
    proyeccionesTimer.current = setTimeout(() => { saveCaseProyecciones(id, next); }, 800);
  };

  const removeResult = async (id: string) => {
    await removeCase(id);
    if (activeResultId === id) setActiveResultId(null);
  };

  const downloadJson = (result: ExtractionResult) => {
    const exportData = {
      extraction: result.extraction,
      ratios: result.ratios,
      inconsistencias: result.inconsistencias,
      crossCheck: result.crossCheck,
      verification: result.verification,
      marketAnalysis: result.marketAnalysis,
      companyHistory: result.companyHistory,
      riskAssessment: result.riskAssessment,
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `analisis_${result.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };


  const StatusBadge = ({ status }: { status: RatioStatus | null }) => {
    if (status === null) return <div className="w-3 h-3 rounded-full shadow-sm bg-gray-300" />;
    const colors: Record<RatioStatus, string> = {
      critical: 'bg-red-500',
      alert: 'bg-yellow-500',
      healthy: 'bg-emerald-500'
    };
    return <div className={cn("w-3 h-3 rounded-full shadow-sm", colors[status])} />;
  };

  type RatioFormat = 'pct' | 'num';
  type RatioSpec = { key: RatioKey; name: string; format: RatioFormat };
  // Bloques compartidos (src/features/ratios/blocks.ts); el layout de impresión usa formato simple.
  const RATIO_BLOCKS: Array<{ bloque: string; ratios: RatioSpec[] }> = SHARED_RATIO_BLOCKS.map(b => ({
    bloque: b.bloque,
    ratios: b.ratios.map(r => ({ key: r.key, name: r.name, format: r.kind === 'pct' ? 'pct' : 'num' })),
  }));

  const formatRatioCell = (value: number | null, format: RatioFormat): number | string | null => {
    if (value === null || !Number.isFinite(value)) return null;
    if (format === 'pct') return (value * 100).toFixed(2) + '%';
    return value;
  };

  const buildBlockRows = (block: { ratios: RatioSpec[] }) =>
    block.ratios
      .map(spec => ({
        concepto: spec.name,
        anio_anterior: formatRatioCell(activeResult?.ratios?.[spec.key]?.anterior ?? null, spec.format),
        anio_actual: formatRatioCell(activeResult?.ratios?.[spec.key]?.actual ?? null, spec.format),
      }))
      .filter(row => row.anio_anterior !== null || row.anio_actual !== null);

  
  const evaluateVariation = (variation: number | null): 'healthy' | 'alert' | 'critical' => {
    if (variation === null) return 'alert';
    if (variation > 0) return 'healthy';
    if (variation > -5) return 'alert';
    return 'critical';
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

  type GroupConDetalles = { total: number; detalles: Array<{ rubro: string; monto: number }> };
  const renderAssetLiabilityGroup = (title: string, currentGroup: GroupConDetalles | undefined, prevGroup: GroupConDetalles | undefined, anioActual: string | number = 'Actual', anioAnterior: string | number = 'Anterior') => {
    if (!currentGroup) return null;
    
    return (
      <details className="group/section ml-4 mb-4 border-l-2 border-ink/10 pl-4">
        <summary className="flex items-center justify-between cursor-pointer hover:bg-ink/5 p-2 rounded select-none list-none transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-xs">{title.includes("No") ? "🔹" : "🔹"}</span>
            <span className="font-bold uppercase text-sm">{title}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono font-bold text-sm text-ink">
              {formatCurrencyThousands(currentGroup.total)}
            </span>
            <ChevronRight className="w-4 h-4 transition-transform group-open/section:rotate-90 opacity-50" />
          </div>
        </summary>
        
        <div className="mt-2 space-y-1 pl-2">
          {/* Header for details */}
          <div className="flex justify-between text-[10px] uppercase opacity-40 px-2 mb-2 border-b border-ink/5 pb-1">
            <span>Rubro</span>
            <div className="flex gap-8 font-mono">
              <span className="w-20 text-right">{anioActual}</span>
              <span className="w-20 text-right">{anioAnterior}</span>
            </div>
          </div>
          
          {Array.isArray(currentGroup.detalles) && currentGroup.detalles.map((item, idx) => {
            const prevItem = prevGroup?.detalles?.find(p => p.rubro === item.rubro);
            return (
              <div key={idx} className="flex justify-between items-center text-xs hover:bg-ink/5 p-2 rounded transition-colors">
                <span className="font-medium text-ink">{item.rubro}</span>
                <div className="flex gap-8 font-mono">
                  <span className="w-20 text-right font-bold text-ink">
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
    <EditProvider value={editContext}>
    <div className="flex h-screen bg-white text-ink font-sans selection:bg-ink selection:text-white">
      {/* Sidebar */}
      <div className="relative flex shrink-0 print:hidden">
      {/* Manija en el borde para contraer / expandir la barra */}
      <button
        onClick={() => setIsHistorySidebarOpen(!isHistorySidebarOpen)}
        className="absolute -right-3.5 top-[26px] z-40 w-7 h-7 rounded-full bg-white border border-ink/15 shadow-sm flex items-center justify-center text-ink/70 hover:text-ink hover:border-ink/40 hover:shadow transition"
        title={isHistorySidebarOpen ? 'Contraer barra lateral' : 'Expandir barra lateral'}
        aria-label={isHistorySidebarOpen ? 'Contraer barra lateral' : 'Expandir barra lateral'}
      >
        {isHistorySidebarOpen ? <ChevronsLeft className="w-4 h-4" /> : <ChevronsRight className="w-4 h-4" />}
      </button>
      <aside className={cn("flex flex-col bg-ink text-white transition-[width] duration-300 relative overflow-hidden", isHistorySidebarOpen ? "w-72" : "w-16")}>
        {/* Contraída: franja con el isologo y accesos con ícono */}
        {!isHistorySidebarOpen && (
          <div className="w-16 flex flex-col items-center h-full py-5 gap-2">
            <button onClick={() => setActiveResultId(null)} className="mb-4 hover:opacity-80 transition-opacity" title="Ir al inicio">
              <BiBankLogo variant="light" layout="icon" className="h-9 w-9" />
            </button>
            <button
              onClick={() => setShowPolicy(v => !v)}
              className={cn("w-10 h-10 rounded-full flex items-center justify-center transition", showPolicy ? "bg-brand-green text-ink" : "text-white/70 hover:text-white hover:bg-white/10")}
              title="Política de riesgos"
            >
              <Scale className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsHistorySidebarOpen(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
              title="Historial de casos"
            >
              <History className="w-4 h-4" />
            </button>
            <div className="mt-auto w-2 h-2 rounded-full bg-brand-green animate-pulse" title="Sistema activo" />
          </div>
        )}
        <div className={cn("w-72 flex flex-col h-full transition-opacity duration-300 overflow-hidden", isHistorySidebarOpen ? "opacity-100" : "hidden")}>
          <div className="px-6 pt-6 pb-5 border-b border-white/15">
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => setActiveResultId(null)} className="hover:opacity-80 transition-opacity" title="Ir al inicio">
                <BiBankLogo variant="light" className="h-9 w-auto" />
              </button>
            </div>
            <p className="font-display text-lg font-semibold leading-tight">Análisis de riesgo</p>
            <p className="text-[11px] text-white/50 mt-0.5">Banca Empresas · Legajo técnico</p>

            {isAuthReady && (
              <div className="mt-5 pt-4 border-t border-white/15">
                {user ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-brand-green text-ink flex items-center justify-center text-[10px] font-bold">
                          {user.email?.[0].toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs truncate text-white/70">{user.email}</span>
                    </div>
                    <button onClick={handleLogout} className="p-1 text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors" title="Cerrar sesión">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleLogin}
                    className="w-full py-2.5 px-4 rounded-full bg-brand-green text-ink text-xs font-semibold hover:brightness-95 transition flex items-center justify-center gap-2"
                  >
                    Iniciar sesión con Google
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="px-6 pt-5">
            <button
              onClick={() => setShowPolicy(v => !v)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-semibold transition-all",
                showPolicy ? "bg-brand-green border-brand-green text-ink" : "border-white/25 text-white hover:border-brand-green hover:text-brand-green"
              )}
            >
              <Scale className="w-4 h-4" />
              Política de riesgos
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-5">
              <h2 className="text-[11px] font-semibold uppercase text-white/50 mb-3 tracking-wider flex items-center gap-2">
                <History className="w-3 h-3" />
                Historial de casos
              </h2>

              <HistorialEmpresas
                results={results}
                activeId={activeResultId}
                onAbrir={setActiveResultId}
                onEliminar={removeResult}
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-white/15">
            <div className="flex items-center gap-2 text-[10px] text-white/50 uppercase tracking-wider">
              <div className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
              Sistema activo
            </div>
          </div>
        </div>
      </aside>
      </div>

      {/* Main Content */}
      <main className="relative flex-1 flex flex-col overflow-hidden bg-canvas print:hidden">
        {/* Página de política de riesgos, por encima del contenido */}
        {showPolicy && (
          <div className="absolute inset-x-0 top-16 bottom-0 z-30 overflow-y-auto bg-canvas p-8">
            <RiskPolicyView onClose={() => setShowPolicy(false)} />
          </div>
        )}
        {/* Header */}
        <header className="h-16 border-b border-ink/10 flex items-center justify-between px-8 bg-white">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-ink/45">Módulo</span>
              <span className="text-sm font-semibold">Dashboard de riesgo</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeResult?.extraction && (activeResult.status === 'completed' || activeResult.status === 'completed_partial') && (
              isEditing ? (
                <>
                  <button onClick={cancelEditing} disabled={isSavingEdits} className="flex items-center gap-2 px-4 py-2 rounded-full border border-ink/20 text-xs font-semibold text-ink hover:border-ink transition-all disabled:opacity-50">
                    <X className="w-4 h-4" />
                    Cancelar
                  </button>
                  <button onClick={saveEdits} disabled={isSavingEdits} className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-green text-ink text-xs font-semibold hover:brightness-95 transition disabled:opacity-50">
                    {isSavingEdits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar cambios
                  </button>
                </>
              ) : (
                <button onClick={startEditing} className="flex items-center gap-2 px-4 py-2 rounded-full border border-ink/20 text-xs font-semibold text-ink hover:border-ink transition-all disabled:opacity-50">
                  <Pencil className="w-4 h-4" />
                  Editar valores
                </button>
              )
            )}
            {activeResult && activeResult.status === 'completed' && !isEditing && (
              <button onClick={() => downloadJson(activeResult)} className="flex items-center gap-2 px-4 py-2 rounded-full border border-ink/20 text-xs font-semibold text-ink hover:border-ink transition-all disabled:opacity-50">
                <Download className="w-4 h-4" />
                Exportar datos
              </button>
            )}
            <button
              onClick={() => { setCurrentFiles([]); setActiveResultId(null); setShowPolicy(false); }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-green text-ink text-xs font-semibold hover:brightness-95 transition disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Nuevo caso
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          {!activeResultId && currentFiles.length === 0 ? (
            <div className="max-w-2xl mx-auto mt-12">
              <div className="mb-12 text-center">
                {user && nombreUsuario && (
                  <p className="text-sm text-ink/55 mb-2">Bienvenido, <span className="font-semibold text-ink">{nombreUsuario}</span></p>
                )}
                <h2 className="text-5xl font-display font-semibold tracking-tight">Análisis de riesgo</h2>
              </div>

              {/* Zona de carga: tarjeta sólida (sin punteado); al arrastrar se marca en verde */}
              <div
                {...getRootProps()}
                className={cn(
                  "relative rounded-2xl bg-white border p-8 md:p-10 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]",
                  !user ? "border-ink/10 cursor-default" : "border-ink/10 cursor-pointer hover:border-ink/25 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.18)]",
                  isDragActive && user ? "border-brand-green ring-4 ring-brand-green/25 bg-brand-green/[0.04]" : ""
                )}
              >
                <input {...getInputProps()} disabled={!user} />
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  <div className={cn(
                    "w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center transition-colors",
                    isDragActive && user ? "bg-brand-green text-ink" : "bg-ink text-brand-green"
                  )}>
                    <Upload className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {!user ? (
                      <>
                        <p className="font-display text-lg font-semibold">Iniciá sesión para analizar</p>
                        <p className="text-sm text-ink/55 mt-0.5">El historial de casos se guarda en tu cuenta.</p>
                      </>
                    ) : isDragActive ? (
                      <>
                        <p className="font-display text-lg font-semibold">Soltá los archivos para empezar</p>
                        <p className="text-sm text-ink/55 mt-0.5">PDF, imágenes, Excel o CSV, uno o varios a la vez.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-display text-lg font-semibold">Cargá la documentación del cliente</p>
                        <p className="text-sm text-ink/55 mt-0.5">Arrastralos acá o elegilos. PDF, imágenes, Excel o CSV.</p>
                      </>
                    )}
                  </div>
                  {user ? (
                    <span className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-brand-green text-ink text-sm font-semibold shrink-0 hover:brightness-95 transition">
                      <Upload className="w-4 h-4" /> Elegir archivos
                    </span>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); handleLogin(); }}
                      className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-green text-ink text-sm font-semibold shrink-0 hover:brightness-95 transition"
                    >
                      Iniciar sesión con Google
                    </button>
                  )}
                </div>
                <div className="mt-6 pt-5 border-t border-ink/10 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/45 mr-1">Qué cargar</span>
                  {[
                    { label: 'Balance y estados contables', req: true },
                    { label: 'Memoria del Directorio', req: false },
                    { label: 'Informe Nosis', req: false },
                    { label: 'Ventas post balance', req: false },
                  ].map(d => (
                    <span key={d.label} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-canvas text-xs text-ink/75">
                      <FileText className="w-3.5 h-3.5 text-ink/45" />
                      {d.label}
                      {d.req && <span className="text-[10px] font-semibold text-ink/45">· obligatorio</span>}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-12 grid grid-cols-3 gap-8">
                {[
                  { label: "Análisis", value: "Ratios y capacidad de pago" },
                  { label: "Cruce", value: "Balance vs. Nosis" },
                  { label: "Opinión", value: "Riesgo de 1 a 100" }
                ].map((stat, i) => (
                  <div key={i} className="relative pt-4 border-t border-ink/15">
                    <span className="absolute -top-px left-0 w-8 h-0.5 bg-brand-green" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-1">{stat.label}</p>
                    <p className="text-sm font-semibold text-ink">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : !activeResultId && currentFiles.length > 0 ? (
            // File Staging Area
            <div className="max-w-2xl mx-auto">
              <h3 className="text-xl font-display font-semibold mb-6">Documentos a procesar</h3>
              <div className="grid gap-4 mb-8">
                {currentFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-white border border-ink/15">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white flex items-center justify-center">
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
                  className="px-5 py-2.5 rounded-full border border-ink/20 bg-white text-sm font-semibold hover:border-ink cursor-pointer flex items-center gap-2 transition"
                >
                  <input {...getInputProps()} />
                  <Upload className="w-4 h-4" />
                  Agregar más
                </div>
                <button 
                  onClick={processFiles}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-brand-green text-ink text-sm font-semibold hover:brightness-95 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  Analizar documentos
                </button>
              </div>
            </div>
          ) : (
            // Results View
            <div className="h-full flex flex-col gap-8">
              {/* Dashboard Header Status */}
              {activeResult?.status === 'processing' && (
                <AnalysisFlow
                  stage={processingStage}
                  fileNames={activeResult.fileNames}
                />
              )}

              {activeResult?.status === 'error' && (
                <div className="bg-red-50 border border-red-200 p-8 text-center text-red-800">
                  <AlertCircle className="w-8 h-8 mx-auto mb-4" />
                  <h3 className="text-lg font-bold">Error en el Análisis</h3>
                  <p className="text-sm mt-2">{activeResult.error}</p>
                </div>
              )}

              {(activeResult?.status === 'completed' || activeResult?.status === 'completed_partial') && activeResult.extraction && (
                <>
                  {isEditing && (
                    <div className="border-l-4 border-brand-blue bg-brand-blue/5 p-3 text-sm text-ink flex items-center gap-2 print:hidden">
                      <Pencil className="w-4 h-4 shrink-0" />
                      <span>
                        <strong>Modo edición.</strong> Los campos resaltados son editables; ratios, chequeos de consistencia y cruce con Nosis se recalculan al instante. En "Balance y Ratios" están también los datos de origen.
                      </span>
                    </div>
                  )}
                  {editError && (
                    <div className="border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900 print:hidden">
                      No se pudieron guardar los cambios: {editError}
                    </div>
                  )}
                  {!isEditing && activeResult.editedAt && (
                    <div className="border-l-4 border-ink/40 bg-white p-3 text-xs text-ink/80 print:hidden">
                      Valores editados manualmente el {new Date(activeResult.editedAt).toLocaleString('es-AR')}. El resumen ejecutivo y el análisis de mercado se generaron con los valores originales.
                    </div>
                  )}
                  {activeResult.inconsistencias.length > 0 && (
                    <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 print:hidden">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-700 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-yellow-900 mb-2">
                            Sanity check detectó {activeResult.inconsistencias.length} inconsistencia(s)
                          </h4>
                          <ul className="text-xs text-yellow-900/80 space-y-1 list-disc list-inside">
                            {activeResult.inconsistencias.map((inc, i) => (
                              <li key={i}>
                                <span className="font-mono text-[10px] bg-yellow-100 px-1.5 py-0.5 rounded">{inc.campo}</span>{' '}
                                {inc.mensaje}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeResult.status === 'completed_partial' && (
                    <div className="border-l-4 border-orange-500 bg-orange-50 p-3 text-sm text-orange-900 print:hidden">
                      Verificación incompleta: el informe ejecutivo no pudo generarse. Los ratios y la extracción están disponibles.
                    </div>
                  )}
                  {marketAnalysisBusyId === activeResult.id && !activeResult.marketAnalysis && (
                    <div className="border-l-4 border-brand-blue bg-brand-blue/5 p-3 text-xs text-ink flex items-center gap-2 print:hidden">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generando análisis de mercado en segundo plano...
                    </div>
                  )}
                  {companyHistoryBusyId === activeResult.id && !activeResult.companyHistory && (
                    <div className="border-l-4 border-brand-blue bg-brand-blue/5 p-3 text-xs text-ink flex items-center gap-2 print:hidden">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Leyendo la Memoria para historia y actividad de la empresa...
                    </div>
                  )}
                  {riskBusyId === activeResult.id && (
                    <div className="border-l-4 border-brand-blue bg-brand-blue/5 p-3 text-xs text-ink flex items-center gap-2 print:hidden">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generando la opinión de riesgo integral (último paso)...
                    </div>
                  )}
                  {sectorActivo && storedResult?.extraction && (
                    <SectorBanner
                      sector={sectorActivo}
                      porton={porton}
                      generando={riskBusyId === activeResult.id}
                      bloqueadoPorEdicion={isEditing}
                      onConfirmar={(rubro, motivo, nota, sub) => storedResult && confirmSector(storedResult, rubro, motivo, nota, sub)}
                      onGenerarOpinion={() => storedResult && generateRiskAssessment(storedResult)}
                      prechequeo={prechequeo ? {
                        faltantes: prechequeo.base.filter(i => !i.ok).length + prechequeo.documentosRubro.filter(d => d.recomendado && d.cargados.length === 0).length + (prechequeo.bloqueFinanciero.requerido && !prechequeo.bloqueFinanciero.cargado ? 1 : 0),
                        alertas: prechequeo.alertas.length,
                      } : null}
                      onVerPrechequeo={() => setActiveTab('Opinión de riesgos')}
                    />
                  )}
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
                              ? "border-brand-green bg-white text-ink font-semibold"
                              : "border-transparent text-ink/60 hover:bg-white/60 hover:text-ink"
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
                  <div className="bg-white border border-ink/15 p-6 relative overflow-hidden">
                    <h1 className="text-2xl font-display font-semibold mb-2 relative z-10">
                      <EditableText
                        path={['company_profile', 'name']}
                        value={activeResult.extraction?.company_profile?.name}
                        display={activeResult.extraction?.company_profile?.name || "EMPRESA NO IDENTIFICADA"}
                        inputClassName="text-xl font-bold uppercase"
                      />
                    </h1>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-mono opacity-60 border-t border-ink/10 pt-2 relative z-10">
                      <span>
                        <strong className="font-bold">CUIT:</strong>{' '}
                        <EditableText path={['company_profile', 'cuit']} value={activeResult.extraction?.company_profile?.cuit} display={activeResult.extraction?.company_profile?.cuit || "N/A"} inputClassName="w-40 inline-block" />
                      </span>
                      <span className="h-3 w-[1px] bg-ink/20" />
                      <span>
                        <strong className="font-bold">ACTIVIDAD:</strong>{' '}
                        <EditableText path={['company_profile', 'activity']} value={activeResult.extraction?.company_profile?.activity} display={activeResult.extraction?.company_profile?.activity || "No especificada"} inputClassName="w-64 inline-block" />
                      </span>
                      <span className="h-3 w-[1px] bg-ink/20" />
                      <span className="italic text-[#000000] opacity-100">Valores expresados en miles de pesos</span>
                    </div>
                  </div>

                  

                    {activeTab === 'Resumen Ejecutivo' && (
                      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <ExecutiveSummaryView
                          result={activeResult}
                          riskBusy={riskBusyId === activeResult.id}
                          onOpenTab={setActiveTab}
                          onGeneratePdf={() => porton.puedeExportarPdf && generatePDF(activeResult)}
                          perfil={perfilVista}
                          porton={porton}
                        />
                      </div>
                    )}

                    {activeTab === 'Balance y Ratios' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {activeResult.ratios && (
                          <BalanceRatiosView
                            extraction={activeResult.extraction}
                            ratios={activeResult.ratios}
                            perfil={perfilVista}
                            pendienteRubro={!porton.rubroConfirmado}
                            documentos={documentosActivos.filter(d => d.estado === 'ok')}
                            cabecera={porton.rubroConfirmado ? (
                              <PerfilAviso
                                compacto
                                onVerPolitica={() => setShowPolicy(true)}
                                perfil={perfilVista}
                                sector={porton.opinion === 'vigente' && activeResult.riskAssessment?.sector ? activeResult.riskAssessment.sector : sectorActivo}
                                mora={perfilVista.modelo === 'financiera' && activeResult.extraction
                                  ? indicadoresFinancieros(activeResult.extraction, documentosActivos.filter(d => d.estado === 'ok'), { disponibilidades: disponibilidadesActuales(activeResult.extraction) }).mora
                                  : null}
                                documentos={documentosActivos}
                              />
                            ) : null}
                          />
                        )}
                        {isEditing && activeResult.extraction && <SourceDataEditor extraction={activeResult.extraction} />}
                      </div>
                    )}

                    {activeTab === 'Información post balance' && (
                      <PostBalanceView
                        datos={activeResult.extraction?.analisis_post_cierre ?? null}
                        ajuste={{
                          activo: isInflationAdjusted, setActivo: setIsInflationAdjusted,
                          interanual: inflationInteranual, setInteranual: setInflationInteranual,
                          mensual: inflationMensual, setMensual: setInflationMensual,
                        }}
                      />
                    )}

                  {activeTab === 'Proyecciones' && (
                    perfilVista.modelo === 'financiera' ? (
                      <div className="bg-white border border-ink/15 px-6 py-10 text-center">
                        <p className="font-display text-base font-semibold">No aplica a financieras</p>
                        <p className="text-sm text-ink/55 mt-1 max-w-xl mx-auto">El modelo de capacidad de repago (EBITDA y DSCR) es de empresa productiva. En una financiera, los intereses son su costo de fondeo y la deuda se renueva con la cartera: se analizan la mora, el capital y el fondeo.</p>
                      </div>
                    ) :
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <ProyeccionesView
                        result={activeResult}
                        guardadas={activeResult.proyecciones ?? null}
                        onChange={next => updateProyecciones(activeResult.id, next)}
                      />
                    </div>
                  )}

                  {activeTab === 'Sistema Financiero (Nosis)' && (
                    activeResult.extraction?.extraccion_nosis ? (
                      <SistemaFinancieroView nosis={activeResult.extraction.extraccion_nosis} crossCheck={activeResult.crossCheck} />
                    ) : (
                      <div className="bg-white border border-ink/15 px-6 py-10 text-center">
                        <p className="font-display text-base font-semibold">Sin informe Nosis</p>
                        <p className="text-sm text-ink/50 mt-1">No se adjuntó un informe Nosis en este caso, o no se pudo leer.</p>
                      </div>
                    )
                  )}

                  {activeTab === 'Accionistas y Directorio' && (
                    <AccionistasView datos={activeResult.extraction?.accionistas_y_directorio ?? null} />
                  )}

                  {activeTab === 'Mercado' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
                      <div className="w-full bg-white border border-ink/15 p-10 font-sans text-left leading-relaxed">
                        {activeResult.marketAnalysis ? (
                          <div className="prose prose-sm md:prose-base max-w-none print:max-w-none print:w-full prose-headings:font-display prose-headings:font-semibold prose-headings:text-gray-800 prose-p:text-left prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
                            <ReactMarkdown>{activeResult.marketAnalysis}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="text-center text-ink/60 font-mono text-sm py-8">
                            No se generó análisis de mercado para este reporte.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'Historia y actividad de la empresa' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <CompanyHistoryView
                        history={activeResult.companyHistory ?? null}
                        isGenerating={companyHistoryBusyId === activeResult.id}
                      />
                    </div>
                  )}

                  {activeTab === 'Opinión de riesgos' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                      {prechequeo && storedResult && (
                        <div className="@container">
                          <PreChequeo
                            prechequeo={prechequeo}
                            documentos={documentosActivos}
                            fechaCaso={activeResult.timestamp}
                            extrayendoBloque={extrayendoBloqueId === activeResult.id}
                            balanceEnSesion={archivosSesion.current.has(activeResult.id)}
                            onCargarDocumento={(tipo, file) => cargarDocumento(storedResult, tipo, file)}
                            onEditarDocumento={(id, ext) => editarDocumento(storedResult, id, ext)}
                            onBorrarDocumento={id => borrarDocumento(storedResult, id)}
                            onExtraerBloque={files => extraerBloqueFinanciero(storedResult, files)}
                          />
                        </div>
                      )}
                      <RiskOpinionView
                        assessment={activeResult.riskAssessment ?? null}
                        isGenerating={riskBusyId === activeResult.id}
                        canGenerate={!!storedResult?.extraction && !isEditing}
                        onGenerate={() => storedResult && generateRiskAssessment(storedResult)}
                        editedAt={activeResult.editedAt}
                        porton={porton}
                        sector={sectorActivo}
                        mora={perfilVista.modelo === 'financiera' && activeResult.extraction
                          ? indicadoresFinancieros(activeResult.extraction, documentosActivos.filter(d => d.estado === 'ok'), { disponibilidades: disponibilidadesActuales(activeResult.extraction) }).mora
                          : null}
                        documentos={documentosActivos}
                      />
                    </div>
                  )}

                  </div>
                </div>
                </>
              )}
            </div>
          )}
        </div>

      </main>
      {/* Print Layout */}
      {activeResult && activeResult.extraction && (
        <div className="hidden print:block bg-white text-black w-full font-sans">
          <table className="w-full">
            <thead>
              <tr>
                <td>
                  <div className="flex justify-between items-center border-b-2 border-ink pb-4 mb-8">
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
                        <div className="w-full bg-white border border-ink/15 p-6 mb-8 font-sans">
                          <h3 className="text-lg font-bold mb-4 uppercase text-ink">Resumen</h3>
                          {activeResult.verification?.executive_summary ? (
                            <div className="text-left text-ink prose prose-sm max-w-none prose-p:mb-4 last:prose-p:mb-0">
                              <ReactMarkdown>{stripRiskConclusion(activeResult.verification.executive_summary)}</ReactMarkdown>
                            </div>
                          ) : (
                            <p className="text-sm text-ink/60 italic">
                              El resumen ejecutivo no se pudo generar para este caso.
                            </p>
                          )}
                        </div>

                        {/* Patrimonial Summary Table (Quick View) */}
                        <div className="bg-canvas p-6 border border-ink/15 mb-8">
                          <h3 className="text-base font-bold uppercase tracking-widest mb-4 opacity-70 text-ink">Resumen Patrimonial {activeResult.extraction?.company_profile?.anio_actual || ''} (Vista Rápida)</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-ink">Total Activo</p>
                              <div className="flex items-baseline">
                                <p className="text-xl font-bold font-mono text-ink">
                                  {formatCurrencyThousands(activeResult.extraction?.ejercicio_actual?.estado_situacion_patrimonial?.total_activo)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.extraction?.ejercicio_actual?.estado_situacion_patrimonial?.total_activo || 0,
                                  activeResult.extraction?.ejercicio_anterior?.estado_situacion_patrimonial?.total_activo || 0
                                )} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-ink">Total Pasivo</p>
                              <div className="flex items-baseline">
                                <p className="text-xl font-bold font-mono text-ink">
                                  {formatCurrencyThousands(activeResult.extraction?.ejercicio_actual?.estado_situacion_patrimonial?.total_pasivo)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.extraction?.ejercicio_actual?.estado_situacion_patrimonial?.total_pasivo || 0,
                                  activeResult.extraction?.ejercicio_anterior?.estado_situacion_patrimonial?.total_pasivo || 0
                                )} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-ink">Patrimonio Neto</p>
                              <div className="flex items-baseline">
                                <p className="text-xl font-bold font-mono text-ink">
                                  {formatCurrencyThousands(activeResult.extraction?.ejercicio_actual?.estado_situacion_patrimonial?.patrimonio_neto)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.extraction?.ejercicio_actual?.estado_situacion_patrimonial?.patrimonio_neto || 0,
                                  activeResult.extraction?.ejercicio_anterior?.estado_situacion_patrimonial?.patrimonio_neto || 0
                                )} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-ink">Resultado Final</p>
                              <div className="flex items-baseline">
                                <p className={cn(
                                  "text-xl font-bold font-mono",
                                  (activeResult.extraction?.ejercicio_actual?.estado_resultados?.resultado_neto || 0) >= 0 ? "text-ink" : "text-red-600"
                                )}>
                                  {formatCurrencyThousands(activeResult.extraction?.ejercicio_actual?.estado_resultados?.resultado_neto)}
                                </p>
                                <VariationBadge variation={calculateVariation(
                                  activeResult.extraction?.ejercicio_actual?.estado_resultados?.resultado_neto || 0,
                                  activeResult.extraction?.ejercicio_anterior?.estado_resultados?.resultado_neto || 0
                                )} />
                              </div>
                            </div>
                          </div>
                        </div>

                  {/* Nuevas Tarjetas KPI (Fila Superior) */}
                  <h3 className="text-lg font-bold mb-4 uppercase text-ink">Ratios</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {/* Tarjeta 1: VENTAS */}
                    <div className="bg-white border border-ink/15 p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateVariation(calculateVariation(
                            activeResult.extraction?.ejercicio_actual?.estado_resultados?.ventas_netas || 0,
                            activeResult.extraction?.ejercicio_anterior?.estado_resultados?.ventas_netas || 0
                          ))} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-ink uppercase mb-2">VENTAS (EN MILES)</p>
                      <p className="text-3xl font-bold font-sans mb-2 text-ink">
                        {formatCurrencyThousands(activeResult.extraction?.ejercicio_actual?.estado_resultados?.ventas_netas)}
                      </p>
                      <div className="flex items-center text-xs font-sans font-bold text-gray-600 leading-tight">
                        <VariationBadge variation={calculateVariation(
                          activeResult.extraction?.ejercicio_actual?.estado_resultados?.ventas_netas || 0,
                          activeResult.extraction?.ejercicio_anterior?.estado_resultados?.ventas_netas || 0
                        )} />
                        <span className="ml-1">Var. interanual</span>
                      </div>
                    </div>

                    {/* Tarjeta 2: EBITDA */}
                    <div className="bg-white border border-ink/15 p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateVariation(calculateVariation(
                            (activeResult.ratios?.ebitda.actual ?? 0),
                            (activeResult.ratios?.ebitda.anterior ?? 0)
                          ))} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-ink uppercase mb-2">EBITDA (EN MILES)</p>
                      <p className="text-3xl font-bold font-sans mb-2 text-ink">
                        {formatCurrencyThousands((activeResult.ratios?.ebitda.actual ?? null))}
                      </p>
                      <div className="flex items-center text-xs font-sans font-bold text-gray-600 leading-tight">
                        <VariationBadge variation={calculateVariation(
                          (activeResult.ratios?.ebitda.actual ?? 0),
                          (activeResult.ratios?.ebitda.anterior ?? 0)
                        )} />
                        <span className="ml-1">Var. interanual</span>
                      </div>
                    </div>

                    {/* Tarjeta 3: DEUDA BANCARIA TOTAL */}
                    <div className="bg-white border border-ink/15 p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          <StatusBadge status={activeResult.ratios?.deuda_ebitda.status ?? null} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-ink uppercase mb-2">DEUDA BANCARIA TOTAL (EN MILES)</p>
                      <p className="text-3xl font-bold font-sans mb-2 text-ink">
                        {formatCurrencyThousands(activeResult.ratios?.deuda_bancaria_total.actual ?? null)}
                      </p>
                      <p className="text-xs font-sans font-bold text-gray-600 leading-tight">Total sistema financiero</p>
                    </div>

                    {/* Tarjeta 4: DEUDA CORTO PLAZO */}
                    <div className="bg-white border border-ink/15 p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <div className="absolute top-4 right-4">
                          {(() => {
                            const deudaCPActual = activeResult.extraction?.deuda_bancaria_actual?.corriente?.total ?? null;
                            const deudaCPAnterior = activeResult.extraction?.deuda_bancaria_anterior?.corriente?.total ?? null;
                            return <StatusBadge status={evaluateVariation(calculateVariation(deudaCPActual || 0, deudaCPAnterior || 0))} />;
                          })()}
                        </div>
                        <p className="text-[10px] font-sans font-bold text-ink uppercase mb-2">DEUDA CORTO PLAZO (EN MILES)</p>
                      {(() => {
                        const deudaCPActual = activeResult.extraction?.deuda_bancaria_actual?.corriente?.total ?? null;
                        const deudaCPAnterior = activeResult.extraction?.deuda_bancaria_anterior?.corriente?.total ?? null;
                        
                        if (deudaCPActual === null) {
                          return <p className="text-3xl font-bold font-sans mb-2 text-ink">-</p>;
                        }

                        return (
                          <>
                            <p className="text-3xl font-bold font-sans mb-2 text-ink">
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

                      </div>

                  </div>

                  {/* Balance y Ratios */}
                  <div className="mb-12 print:break-inside-avoid">

                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Balance y Ratios</h2>
                    <div className="space-y-8">
                       <ComparativeView extraction={activeResult.extraction} ratios={activeResult.ratios} />
                       {RATIO_BLOCKS.map(block => {
                         const rows = buildBlockRows(block);
                         if (rows.length === 0) return null;
                         return <Table key={block.bloque} title={block.bloque} data={rows} />;
                       })}
                    </div>
                  </div>

                  {/* Accionistas y Directorio */}
                  <div className="mb-12 print:break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-2 print:break-after-avoid uppercase tracking-tight">Accionistas y Directorio</h2>

                    <div className="space-y-8  font-sans">
                      {/* Bloque 1: COMPOSICIÓN ACCIONARIA */}
                      <div className="bg-white border border-ink/15 p-6">
                        <h3 className="text-lg font-semibold text-ink mb-6">COMPOSICIÓN SOCIAL / ACCIONISTAS</h3>
                        {!(activeResult.extraction?.accionistas_y_directorio?.accionistas?.length) && (
                          <p className="text-sm text-ink/50">No se encontró la composición accionaria en la documentación.</p>
                        )}
                        <ShareholderTable 
                          accionistas={activeResult.extraction?.accionistas_y_directorio?.accionistas ?? []}
                        />
                      </div>

                      {/* Bloque 2: DIRECTORIO Y MANAGEMENT */}
                      <div className="bg-white border border-ink/15 p-6 mt-8">
                        <h3 className="text-base font-semibold text-black mb-6">ÓRGANO DE ADMINISTRACIÓN / DIRECTORIO</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Array.isArray(activeResult.extraction?.accionistas_y_directorio?.directorio) && activeResult.extraction?.accionistas_y_directorio.directorio.length > 0 ? (
                            activeResult.extraction?.accionistas_y_directorio.directorio.map((miembro, idx) => (
                              <div key={idx} className="p-4 border border-ink/10 bg-panel rounded-sm hover:border-ink/30 transition-colors">
                                <p className="text-[13px] uppercase tracking-wider text-ink/50 mb-1">{miembro.cargo}</p>
                                <p className="font-medium text-ink">{miembro.nombre}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-ink/50 col-span-full">No se encontró el directorio en la documentación.</p>
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

                    {activeResult.marketAnalysis ? (
                      <div className="w-full bg-white border border-ink/15 p-10 font-sans text-left leading-relaxed">
                        <div className="prose prose-sm md:prose-base max-w-none print:max-w-none print:w-full prose-headings:font-display prose-headings:font-semibold prose-headings:text-gray-800 prose-p:text-left prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
                          <ReactMarkdown>{activeResult.marketAnalysis}</ReactMarkdown>
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
                      {activeResult.extraction?.analisis_post_cierre && activeResult.extraction.analisis_post_cierre.total_ventas_post_cierre > 0 ? (
                        <div className="bg-white border border-ink/15 p-6 font-sans">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <h3 className="text-lg font-semibold text-ink">EVOLUCIÓN DE VENTAS POST BALANCE (COMPARATIVO INTERANUAL)</h3>
                            
                            <div className="flex flex-col items-end gap-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <span className="text-xs font-bold uppercase text-ink/70">Ver en moneda constante (Último mes)</span>
                                <div className="relative">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only" 
                                    checked={isInflationAdjusted}
                                    onChange={(e) => setIsInflationAdjusted(e.target.checked)}
                                  />
                                  <div className={`block w-10 h-6 rounded-full transition-colors ${isInflationAdjusted ? 'bg-ink' : 'bg-gray-300'}`}></div>
                                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isInflationAdjusted ? 'transform translate-x-4' : ''}`}></div>
                                </div>
                              </label>
                              
                              {isInflationAdjusted && (
                                <div className="flex items-center gap-3 text-xs animate-in fade-in slide-in-from-top-2">
                                  <div className="flex items-center gap-1">
                                    <span className="text-ink/70">% Interanual:</span>
                                    <input 
                                      type="number" 
                                      value={inflationInteranual}
                                      onChange={(e) => setInflationInteranual(Number(e.target.value))}
                                      className="w-16 px-1 py-0.5 border border-ink/20 rounded text-right"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-ink/70">% Mensual Promedio:</span>
                                    <input 
                                      type="number" 
                                      value={inflationMensual}
                                      onChange={(e) => setInflationMensual(Number(e.target.value))}
                                      className="w-16 px-1 py-0.5 border border-ink/20 rounded text-right"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="">
                            <table className="w-full text-sm text-left border-collapse">
                              <thead className="bg-canvas text-ink text-xs uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-3 font-semibold border-b border-ink/20">Mes</th>
                                  <th className={`px-4 py-3 font-semibold border-b border-ink/20 text-right transition-colors ${isInflationAdjusted ? 'bg-brand-blue/5' : ''}`}>Año Actual ($)</th>
                                  <th className={`px-4 py-3 font-semibold border-b border-ink/20 text-right transition-colors ${isInflationAdjusted ? 'bg-brand-blue/5' : ''}`}>Año Anterior ($)</th>
                                  <th className="px-4 py-3 font-semibold border-b border-ink/20 text-right">Var. (%)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink/10">
                                {(() => {
                                  const rawVentas = activeResult.extraction.analisis_post_cierre.detalle_ventas_mensuales;
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
                                      <tr key={idx} className="hover:bg-ink/5 transition-colors">
                                        <td className="px-4 py-3 font-medium text-ink">{venta.mes}</td>
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
                                  const rawVentas = activeResult.extraction.analisis_post_cierre.detalle_ventas_mensuales;
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
                                    <tr className="bg-canvas font-bold text-ink">
                                      <td className="px-4 py-3 border-t border-ink/20">TOTAL ACUMULADO</td>
                                      <td className="px-4 py-3 border-t border-ink/20 text-right font-mono">{formatCurrencyThousands(totalActual)}</td>
                                      <td className="px-4 py-3 border-t border-ink/20 text-right font-mono">
                                        {totalAnterior > 0 ? formatCurrencyThousands(totalAnterior) : <span className="text-xs opacity-50 italic font-normal">Sin información</span>}
                                      </td>
                                      <td className={`px-4 py-3 border-t border-ink/20 text-right font-mono ${totalVar !== null && totalVar >= 0 ? 'text-emerald-600' : ''} ${totalVar !== null && totalVar < 0 ? 'text-red-600' : ''}`}>
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
                          
                          {activeResult.extraction.analisis_post_cierre.notas_relevantes && (
                            <div className="mt-2 text-xs opacity-70 italic border-t border-ink/10 pt-2">
                              Nota: {activeResult.extraction.analisis_post_cierre.notas_relevantes}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-white border border-ink/15 p-12 text-center text-ink/60 font-mono text-sm">
                          No hay información post balance disponible.
                        </div>
                      )}

                      {/* Deuda Bancaria Asumida Post Balance */}
                      {Array.isArray(activeResult.extraction?.analisis_post_cierre?.deuda_bancaria_post_balance_detalle) && activeResult.extraction.analisis_post_cierre.deuda_bancaria_post_balance_detalle.length > 0 && (
                        <div className="bg-white border border-ink/15 p-6 mt-8">
                          <h3 className="text-lg font-semibold text-ink mb-6">DEUDA BANCARIA ASUMIDA POST BALANCE</h3>
                          
                          <div className="">
                            <table className="w-full text-sm text-left border-collapse">
                              <thead className="bg-canvas text-ink text-xs uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-3 font-semibold border-b border-ink/20">ENTIDAD BANCARIA / ACREEDOR</th>
                                  <th className="px-4 py-3 font-semibold border-b border-ink/20 text-right">MONTO ASUMIDO</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink/10">
                                {activeResult.extraction.analisis_post_cierre.deuda_bancaria_post_balance_detalle.map((item: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-ink/5 transition-colors">
                                    <td className="px-4 py-3 font-medium text-ink">{item.entidad}</td>
                                    <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrencyThousands(item.monto, item.moneda)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-canvas font-bold text-ink">
                                  <td className="px-4 py-3 text-right">TOTAL DEUDA POST BALANCE:</td>
                                  <td className="px-4 py-3 text-right font-mono">
                                    {formatCurrencyThousands(
                                      activeResult.extraction.analisis_post_cierre.deuda_bancaria_post_balance_detalle.reduce((acc: number, curr: any) => acc + (Number(curr.monto) || 0), 0),
                                      activeResult.extraction.analisis_post_cierre.deuda_bancaria_post_balance_detalle[0]?.moneda || 'ARS'
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

                    <p className="text-sm text-gray-600">La proyección de capacidad de repago (supuestos, escenarios y DSCR) se incluye en el informe PDF para comité.</p>
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
                  {activeResult.extraction?.extraccion_nosis && (
                    <div className="border border-ink/15 bg-white mt-8">
                      <div className="flex items-center justify-between p-4 border-b border-ink/10 bg-canvas select-none">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📑</span>
                          <span className="text-lg font-bold uppercase tracking-wider">PESTAÑA NOSIS (ANTECEDENTES Y BCRA)</span>
                        </div>
                      </div>
                      
                      <div className="p-6 bg-panel">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-ink">Score Crediticio</p>
                              <p className="text-xl font-bold font-mono text-ink">
                                {activeResult.extraction?.extraccion_nosis?.score_crediticio}
                              </p>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-ink">Peor Situación BCRA</p>
                              <p className="text-xl font-bold font-mono text-ink">
                                Categoría {activeResult.extraction?.extraccion_nosis?.situacion_bcra_peor_estado}
                              </p>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-ink">Cheques Rechazados</p>
                              <p className="text-xl font-bold font-mono text-ink">
                                {activeResult.extraction?.extraccion_nosis?.cheques_rechazados_cantidad} cheques
                              </p>
                              <p className="text-xs opacity-70 mt-1">
                                por un total de {formatCurrencyThousands(activeResult.extraction?.extraccion_nosis?.cheques_rechazados_monto)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[13px] font-bold uppercase opacity-50 mb-1 text-ink">Deuda Total Nosis</p>
                              <p className="text-xl font-bold font-mono text-ink">
                                {formatCurrencyThousands(activeResult.extraction?.extraccion_nosis?.deuda_financiera_total_nosis)}
                              </p>
                              <p className="text-[10px] opacity-50 mt-1">(Expresado en miles)</p>
                            </div>
                          </div>

                          {false && null}

                          <h4 className="text-xs font-bold uppercase mb-4 opacity-70 border-b border-ink/10 pb-2">Detalle de Entidades</h4>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            <div className="">
                              <table className="w-full text-sm font-mono border-collapse">
                                <thead>
                                  <tr className="border-b border-ink">
                                    <th className="text-left py-2 font-bold uppercase text-xs opacity-60">Entidad</th>
                                    <th className="text-center py-2 font-bold uppercase text-xs opacity-60">Situación</th>
                                    <th className="text-right py-2 font-bold uppercase text-xs opacity-60 w-1/3">Monto / Participación</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink/10">
                                  {(() => {
                                    const rawEntidades = activeResult.extraction?.extraccion_nosis?.detalle_entidades;
                                    const entidades = Array.isArray(rawEntidades) ? rawEntidades : [];
                                    const totalDeudaNosis = activeResult.extraction?.extraccion_nosis?.deuda_financiera_total_nosis || 0;
                                    const totalSuma = entidades.reduce((acc, curr) => acc + (Number(curr?.monto) || 0), 0);
                                    const totalReferencia = totalDeudaNosis > 0 ? totalDeudaNosis : totalSuma;

                                    return entidades.map((entidad, i) => {
                                      const participacion = totalReferencia > 0 ? (((entidad.monto ?? 0) / totalReferencia) * 100).toFixed(1) : "0.0";
                                      return (
                                        <tr key={i} className="hover:bg-ink/5 transition-colors">
                                          <td className="py-3 font-bold">{entidad.entidad}</td>
                                          <td className="py-3 text-center font-bold text-ink">{entidad.situacion}</td>
                                          <td className="py-3">
                                            <div className="flex flex-col gap-1 items-end">
                                              <span className="font-bold text-ink">{formatCurrencyThousands(entidad.monto)} ({participacion}%)</span>
                                              <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                                <div className="bg-ink h-full" style={{ width: `${participacion}%` }}></div>
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
                            
                            {/* Deuda por entidad: barras ordenadas (reemplaza al donut) */}
                            {Array.isArray(activeResult.extraction?.extraccion_nosis?.detalle_entidades) && activeResult.extraction?.extraccion_nosis.detalle_entidades.length > 0 && (
                              <NosisDebtBars entidades={activeResult.extraction.extraccion_nosis.detalle_entidades} />
                            )}
                          </div>
                        </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                    
                        {/* Cross Check Section */}
                    <div className="lg:col-span-1 bg-ink text-white p-6 border border-ink/15 flex flex-col">
                      <div className="flex items-center gap-2 mb-6 border-b border-white/20 pb-4">
                        <Scale className="w-5 h-5" />
                        <h3 className="font-sans font-bold text-lg">Cruce de Deuda</h3>
                      </div>
                      
                      {activeResult.crossCheck ? (
                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] opacity-50 uppercase mb-1">Deuda Balance</p>
                              <p className="font-mono text-lg font-bold text-white">
                                {formatCurrencyThousands(activeResult.crossCheck?.balance_debt)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] opacity-50 uppercase mb-1">Deuda Nosis</p>
                              <p className="font-mono text-lg font-bold text-white">
                                {formatCurrencyThousands(activeResult.crossCheck?.nosis_debt)}
                              </p>
                            </div>
                          </div>
                          
                          <div className={cn(
                            "p-4 border",
                            activeResult.crossCheck?.match 
                              ? "border-emerald-500/50 bg-emerald-500/10" 
                              : "border-red-500/50 bg-red-500/10"
                          )}>
                            <div className="flex items-center gap-2 mb-1">
                              {activeResult.crossCheck?.match 
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                : <AlertTriangle className="w-4 h-4 text-red-500" />
                              }
                              <span className="text-xs font-bold uppercase">
                                {activeResult.crossCheck?.match ? "Consistente" : "Discrepancia Detectada"}
                              </span>
                            </div>
                            <p className="text-[10px] opacity-70">
                              Diferencia: {formatCurrencyThousands(activeResult.crossCheck?.difference_abs)}
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
    </EditProvider>
  );
}
