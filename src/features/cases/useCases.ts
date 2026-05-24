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
            loaded.push({
              id: data.id,
              timestamp: data.timestamp,
              fileNames: data.fileNames ?? [],
              schemaVersion: SCHEMA_VERSION,
              status: (data.status ?? 'processing') as CaseStatus,
              extraction: parseJSON(data.extraction, null),
              ratios: parseJSON(data.ratios, null),
              inconsistencias: parseJSON(data.inconsistencias, []),
              crossCheck: parseJSON(data.crossCheck, null),
              verification: parseJSON(data.verification, null),
              marketAnalysis: typeof data.marketAnalysis === 'string' ? data.marketAnalysis : null,
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
          extraction: JSON.stringify(pipelineResult.extraction),
          ratios: JSON.stringify(pipelineResult.ratios),
          inconsistencias: JSON.stringify(pipelineResult.inconsistencias),
          crossCheck: JSON.stringify(pipelineResult.crossCheck),
          verification: JSON.stringify(pipelineResult.verification),
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
    saveCaseError,
    removeCase,
  };
}
