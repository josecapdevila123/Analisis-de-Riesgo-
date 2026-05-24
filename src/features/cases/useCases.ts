import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../../firebase';
import { ExtractionResult } from '../../types';

type ParsedResponse = { data: any; dashboardData: any };

export function useCases(user: User | null, isAuthReady: boolean) {
  const [results, setResults] = useState<ExtractionResult[]>([]);

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

  const saveCaseProcessing = async (newResult: ExtractionResult) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `users/${user.uid}/cases`, newResult.id), {
        id: newResult.id,
        timestamp: newResult.timestamp,
        fileNames: newResult.fileNames,
        status: newResult.status,
        userId: user.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/cases/${newResult.id}`);
    }
  };

  const saveCaseCompleted = async (newResult: ExtractionResult, parsedResponse: ParsedResponse) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `users/${user.uid}/cases`, newResult.id), {
        id: newResult.id,
        timestamp: newResult.timestamp,
        fileNames: newResult.fileNames,
        data: JSON.stringify(parsedResponse.data || null),
        dashboardData: JSON.stringify(parsedResponse.dashboardData || null),
        status: 'completed',
        userId: user.uid
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/cases/${newResult.id}`);
    }
  };

  const saveCaseError = async (id: string, errorMessage: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `users/${user.uid}/cases`, id), {
        status: 'error',
        error: errorMessage
      }, { merge: true });
    } catch (dbError) {
      try {
        handleFirestoreError(dbError, OperationType.UPDATE, `users/${user.uid}/cases/${id}`);
      } catch (e) {
        console.error("Failed to save error state to Firestore:", e);
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
      setResults(prev => prev.filter(r => r.id !== id));
    }
  };

  return {
    results,
    setResults,
    saveCaseProcessing,
    saveCaseCompleted,
    saveCaseError,
    removeCase,
  };
}
