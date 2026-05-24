import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  { ignoreUndefinedProperties: true },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

type MaybeFirebaseError = { code?: string; message?: string; name?: string };

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const ctx = `Firestore ${operationType} failed${path ? ` on ${path}` : ''}`;
  const fbe = error as MaybeFirebaseError;
  const detail = fbe?.code ? ` [${fbe.code}] ${fbe.message ?? ''}` : '';
  const message = `${ctx}${detail}`.trim();
  console.error(message, error);
  throw new Error(message, { cause: error });
}
