import type { BloqueTexto } from '../textos/bloques';
import type { DocumentoSectorial } from '../sectorDocs/tipos';
import { SectorCaso, sectorInicial } from '../risk/porton';
import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../../firebase';
import { ExtractionResult, CaseStatus } from '../../types';
import { CompanyHistory, RawExtraction } from '../extraction/schemas';
import { ComputedRatios, computeRatios } from '../ratios/calculations';
import { Inconsistencia, runSanityChecks } from '../ratios/sanityChecks';
import { CrossCheckResult, runCrossCheck } from '../ratios/crossCheck';
import { RiskAssessment } from '../risk/assessment';
import { ProyeccionesGuardadas } from '../projections/types';
import { PipelineResult } from '../extraction/pipeline';

const SCHEMA_VERSION = 2;
const CUTOVER_DOC = 'cutover_v2';

const parseJSON = <T,>(raw: unknown, fallback: T): T => {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

// Ratios, sanity checks y cruce Nosis son datos derivados de la extracción: se
// recalculan al cargar para que los casos viejos usen siempre las fórmulas y la
// política vigentes (y tengan los ratios agregados después). Si algo falla con
// una extracción vieja, se usa lo guardado.
const deriveFromExtraction = (
  extraction: RawExtraction | null,
  stored: { ratios: ComputedRatios | null; inconsistencias: Inconsistencia[]; crossCheck: CrossCheckResult | null }
) => {
  if (!extraction) return stored;
  try {
    return {
      ratios: computeRatios(extraction),
      inconsistencias: runSanityChecks(extraction),
      crossCheck: runCrossCheck(extraction),
    };
  } catch (err) {
    console.warn('No se pudieron recalcular los ratios de un caso guardado:', err);
    return stored;
  }
};

export function useCases(user: User | null, isAuthReady: boolean) {
  const [results, setResults] = useState<ExtractionResult[]>([]);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setResults([]);
      return;
    }

    let unsubscribe: () => void = () => {};
    let cancelled = false;

    const init = async () => {
      // Hard cutover: en la primera entrada de cada usuario con el nuevo schema,
      // borrar todos los casos viejos del shape v1.
      const cutoverRef = doc(db, `users/${user.uid}/_meta`, CUTOVER_DOC);
      try {
        const cutoverSnap = await getDoc(cutoverRef);
        if (!cutoverSnap.exists() || !cutoverSnap.data()?.done) {
          const casesSnap = await getDocs(collection(db, `users/${user.uid}/cases`));
          await Promise.all(casesSnap.docs.map(d => deleteDoc(d.ref)));
          await setDoc(cutoverRef, {
            done: true,
            timestamp: new Date().toISOString(),
            schemaVersion: SCHEMA_VERSION,
          });
        }
      } catch (e) {
        console.error('Cutover v2 falló:', e);
      }

      if (cancelled) return;

      const q = query(
        collection(db, `users/${user.uid}/cases`),
        orderBy('timestamp', 'desc')
      );
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const loaded: ExtractionResult[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            const extraction = parseJSON<RawExtraction | null>(data.extraction, null);
            const derived = deriveFromExtraction(extraction, {
              ratios: parseJSON(data.ratios, null),
              inconsistencias: parseJSON(data.inconsistencias, []),
              crossCheck: parseJSON(data.crossCheck, null),
            });
            loaded.push({
              id: data.id,
              timestamp: data.timestamp,
              fileNames: data.fileNames ?? [],
              schemaVersion: SCHEMA_VERSION,
              status: (data.status ?? 'processing') as CaseStatus,
              extraction,
              ...derived,
              verification: parseJSON(data.verification, null),
              marketAnalysis: typeof data.marketAnalysis === 'string' ? data.marketAnalysis : null,
              companyHistory: parseJSON<CompanyHistory | null>(data.companyHistory, null),
              riskAssessment: parseJSON<RiskAssessment | null>(data.riskAssessment, null),
              proyecciones: parseJSON<ProyeccionesGuardadas | null>(data.proyecciones, null),
              sector: parseJSON<SectorCaso | null>(data.sector, null) ?? (extraction ? sectorInicial(extraction) : null),
              documentosSectoriales: parseJSON<DocumentoSectorial[]>(data.documentosSectoriales, []),
              historiaEditada: parseJSON<BloqueTexto[] | null>(data.historiaEditada, null),
              mercadoEditado: parseJSON<BloqueTexto[] | null>(data.mercadoEditado, null),
              editedAt: typeof data.editedAt === 'string' ? data.editedAt : undefined,
              error: data.error,
            });
          });
          setResults(loaded);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/cases`);
        }
      );
    };
    init();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, isAuthReady]);

  const saveCaseProcessing = async (newResult: ExtractionResult) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `users/${user.uid}/cases`, newResult.id), {
        id: newResult.id,
        timestamp: newResult.timestamp,
        fileNames: newResult.fileNames,
        status: newResult.status,
        schemaVersion: SCHEMA_VERSION,
        userId: user.uid,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/cases/${newResult.id}`);
    }
  };

  const saveCaseCompleted = async (
    newResult: ExtractionResult,
    pipelineResult: PipelineResult
  ) => {
    if (!user) return;
    const stringifySafe = (v: unknown) => JSON.stringify(v ?? null);
    try {
      await setDoc(
        doc(db, `users/${user.uid}/cases`, newResult.id),
        {
          id: newResult.id,
          timestamp: newResult.timestamp,
          fileNames: newResult.fileNames,
          status: pipelineResult.state,
          schemaVersion: SCHEMA_VERSION,
          userId: user.uid,
          extraction: stringifySafe(pipelineResult.extraction),
          ratios: stringifySafe(pipelineResult.ratios),
          inconsistencias: stringifySafe(pipelineResult.inconsistencias),
          crossCheck: stringifySafe(pipelineResult.crossCheck),
          verification: stringifySafe(pipelineResult.verification),
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `users/${user.uid}/cases/${newResult.id}`
      );
    }
  };

  const saveCaseEdits = async (
    id: string,
    edits: Pick<ExtractionResult, 'extraction' | 'ratios' | 'inconsistencias' | 'crossCheck'>,
    editedAt: string
  ) => {
    if (!user) return;
    const stringifySafe = (v: unknown) => JSON.stringify(v ?? null);
    try {
      await setDoc(
        doc(db, `users/${user.uid}/cases`, id),
        {
          extraction: stringifySafe(edits.extraction),
          ratios: stringifySafe(edits.ratios),
          inconsistencias: stringifySafe(edits.inconsistencias),
          crossCheck: stringifySafe(edits.crossCheck),
          editedAt,
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
    }
  };

  const saveCaseMarketAnalysis = async (id: string, text: string | null) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, `users/${user.uid}/cases`, id),
        { marketAnalysis: text ?? null },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
    }
  };

  const saveCaseCompanyHistory = async (id: string, history: CompanyHistory | null) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, `users/${user.uid}/cases`, id),
        { companyHistory: JSON.stringify(history) },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
    }
  };

  const saveCaseRiskAssessment = async (id: string, assessment: RiskAssessment | null) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, `users/${user.uid}/cases`, id),
        { riskAssessment: JSON.stringify(assessment) },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
    }
  };

  const saveCaseTextoEditado = async (id: string, campo: 'historiaEditada' | 'mercadoEditado', bloques: BloqueTexto[] | null) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `users/${user.uid}/cases`, id), { [campo]: JSON.stringify(bloques) }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
    }
  };

  const saveCaseDocumentos = async (id: string, documentos: DocumentoSectorial[]) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `users/${user.uid}/cases`, id), { documentosSectoriales: JSON.stringify(documentos) }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
    }
  };

  const saveCaseSector = async (id: string, sector: SectorCaso) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `users/${user.uid}/cases`, id), { sector: JSON.stringify(sector) }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
    }
  };

  const saveCaseProyecciones = async (id: string, proyecciones: ProyeccionesGuardadas) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, `users/${user.uid}/cases`, id),
        { proyecciones: JSON.stringify(proyecciones) },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
    }
  };

  const saveCaseError = async (id: string, errorMessage: string) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, `users/${user.uid}/cases`, id),
        { status: 'error', error: errorMessage },
        { merge: true }
      );
    } catch (dbError) {
      try {
        handleFirestoreError(dbError, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
      } catch (e) {
        console.error('Failed to save error state to Firestore:', e);
      }
    }
  };

  const removeCase = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/cases`, id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/cases/${id}`);
      }
    } else {
      setResults((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return {
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
    saveCaseTextoEditado,
    saveCaseEdits,
    saveCaseError,
    removeCase,
  };
}
