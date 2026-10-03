# Análisis de Riesgo — BiBank

Herramienta interna de análisis de riesgo crediticio. Extrae con Gemini los datos de balances e informes Nosis, calcula los ratios en código y genera el informe para comité. Ver [CLAUDE.md](CLAUDE.md) para la arquitectura.

La app tiene dos partes:

- **Frontend** (React + Vite, raíz del repo): dashboard, cálculo de ratios, Firestore y PDF.
- **Cloud Functions** (`functions/`): las únicas que hablan con Gemini. La API key vive en **Secret Manager** y nunca llega al navegador.

```
Navegador ──httpsCallable──▶ extract / verify / marketAnalysis ──▶ Gemini
 (login Google)               (Cloud Functions 2nd gen,            (key en
                               verifican auth y validan con Zod)    Secret Manager)
```

## Requisitos

- Node.js 22
- Firebase CLI: `npm install -g firebase-tools`
- Proyecto Firebase en plan **Blaze**. Cloud Functions y Secret Manager no están disponibles en el plan gratuito.

## Deploy de las Cloud Functions

Desde la raíz del repo:

```bash
# 1. Login y proyecto (el proyecto por defecto está en .firebaserc)
firebase login
firebase use default

# 2. Dependencias de las funciones
npm --prefix functions install

# 3. Cargar la API key de Gemini en Secret Manager (la pide por consola, no queda en ningún archivo)
firebase functions:secrets:set GEMINI_API_KEY

# 4. Deploy (compila functions/ antes de subir)
firebase deploy --only functions
```

Se crean tres funciones en `us-central1`: `extract`, `verify` y `marketAnalysis`.

- Para **cambiar la key**, volvé a correr el paso 3 y redeployá. Las funciones leen la última versión del secreto al arrancar.
- Para **ver logs**: `firebase functions:log`, o la consola de Google Cloud → Cloud Run → la función → Logs.

### Después del primer deploy: rotar la key

Hasta esta versión, la key de Gemini viajaba dentro del JavaScript del frontend. Cualquiera que abrió la app pudo copiarla. Una vez que las funciones estén andando:

1. Creá una key nueva en [Google AI Studio](https://aistudio.google.com/apikey).
2. Cargala con `firebase functions:secrets:set GEMINI_API_KEY` y redeployá.
3. **Borrá la key vieja** en AI Studio.
4. Sacá `GEMINI_API_KEY` de `.env.local`: el frontend ya no la usa.

## Desarrollo local

### Opción A: frontend local contra las funciones deployadas

```bash
npm install
npm run dev        # http://localhost:3000
```

No hace falta ninguna key en el frontend. Iniciá sesión con Google y las llamadas van a las funciones de producción.

### Opción B: todo local con el emulador de Functions

1. Creá `functions/.secret.local` (está en `.gitignore`) con:
   ```
   GEMINI_API_KEY=tu-key
   ```
2. En `.env.local` de la raíz, agregá:
   ```
   VITE_FUNCTIONS_EMULATOR=true
   ```
3. En una terminal:
   ```bash
   cd functions && npm run serve      # compila y levanta el emulador en :5001
   ```
4. En otra terminal:
   ```bash
   npm run dev
   ```

El login y Firestore siguen siendo los reales; solo las funciones corren en tu máquina.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Frontend en http://localhost:3000 |
| `npm run lint` | Chequeo de tipos del frontend (`tsc --noEmit`) |
| `npm run test` | Tests de ratios con Vitest |
| `npm run build` | Build de producción en `dist/` |
| `npm --prefix functions run build` | Compila las funciones en `functions/lib/` |

## Límites conocidos

- **Tamaño de archivos:** los PDFs viajan en base64 dentro del request, y Cloud Run limita el request a 32 MB. El frontend corta antes, con un mensaje, si los archivos suman más de ~22 MB.
- **Tiempo:** cada función tiene un timeout de 9 minutos, que cubre los reintentos y el modelo de respaldo cuando Gemini está saturado.
- **Errores frecuentes:**
  - Un error de CORS o `not-found` al analizar casi siempre significa que las funciones no están deployadas o que la región no coincide (`functions/src/config.ts` y `src/firebase.ts`).
  - `unauthenticated` significa que la sesión expiró.
