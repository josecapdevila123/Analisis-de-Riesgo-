# CLAUDE.md

## Qué hace la app

Herramienta interna de **análisis de riesgo crediticio para BiBank**. El analista sube los estados contables de una empresa (PDF o imágenes), más el informe Nosis y documentación post balance si la tiene, y la app:

1. **Extrae** con Gemini los datos del balance, el estado de resultados, la deuda bancaria, las ventas post cierre, el informe Nosis/BCRA y los accionistas y directorio.
2. **Calcula 23 ratios en código**, sin IA (`src/features/ratios/calculations.ts`), además de chequeos de consistencia contable y un cruce de deuda Balance vs Nosis.
3. **Verifica y redacta** con Gemini: interpreta los ratios ya calculados, explica las inconsistencias y genera el resumen ejecutivo.
4. Genera en paralelo un **análisis de mercado** del sector.

El resultado se ve en un dashboard por pestañas, se guarda por usuario en Firestore y se exporta como PDF para el comité (`src/features/pdf/generatePDF.ts`). Los valores extraídos se pueden corregir a mano desde el dashboard ("Editar valores"), y en ese caso los ratios se recalculan.

**Stack:** React 19, Vite 6, TypeScript, Tailwind 4, Zod 4, `@google/genai` (modelo `gemini-2.5-flash`), Firebase (Auth con Google y Firestore), jsPDF y Recharts. Es una SPA sin backend: las llamadas a Gemini salen directo desde el navegador. Nació en Google AI Studio.

## Arquitectura del pipeline

Orquestado en `src/features/extraction/pipeline.ts` (`runPipeline`):

| Etapa | Qué hace | Dónde | Si falla |
|---|---|---|---|
| 1. Extracción | Gemini lee los archivos y devuelve JSON, validado con `RawExtractionSchema` (Zod) | `geminiClient.ts` → `runExtraction`, prompt en `src/lib/prompts/extraction.ts` | Estado `error`, el caso se corta |
| 2. Cómputo | `computeRatios`, `runSanityChecks` y `runCrossCheck`. Determinístico, sin IA | `src/features/ratios/` | — |
| 3. Verificación | Gemini recibe extracción, ratios, inconsistencias y cruce. Interpreta, **no recalcula** | `runVerification`, prompt en `verification.ts` | Estado `completed_partial` (hay ratios, falta el resumen) |
| 4. Mercado | Se lanza en paralelo a la etapa 3 y no bloquea; el resultado llega por callback | `runMarketAnalysis`, prompt en `marketAnalysis.ts` | Se loguea y el caso queda sin análisis de mercado |

Puntos clave:
- **Los números los calcula el código, no la IA.** El prompt de verificación le prohíbe a Gemini recalcular o proponer otros valores.
- Las llamadas a Gemini pasan por `callGemini`, que reintenta con espera creciente los errores 429/5xx y, si no alcanza, usa un modelo de respaldo. La configuración está en `src/lib/gemini.ts`.
- **Schemas tolerantes:** `src/features/extraction/schemas.ts` convierte "N/A", "", null, NaN, etc. en `null` para que la validación no se caiga por variaciones del modelo.
- **Persistencia:** `src/features/cases/useCases.ts`, en `users/{uid}/cases/{caseId}`. `extraction`, `ratios`, `inconsistencias`, `crossCheck` y `verification` se guardan como **strings JSON**. Al entrar por primera vez con el schema v2 se borran los casos v1 de ese usuario.
- **Signos:** Gemini puede devolver costos, gastos y depreciación en negativo o en positivo. `calculations.ts` los normaliza con `Math.abs`; los resultados (valuación de BdC, inversiones permanentes, resultado neto) conservan su signo.
- **Convenciones de datos:** los montos están en **miles de pesos**. Los ratios porcentuales se guardan como fracción (0,15) y se multiplican por 100 al mostrarse. Los porcentajes de participación accionaria y la situación BCRA van como número natural.

### Mapa de archivos

```
src/
  App.tsx                      Dashboard completo (estado, pestañas, layout de impresión). Archivo muy grande.
  types.ts                     ExtractionResult (el caso tal como se guarda)
  firebase.ts                  Init de Firebase + handleFirestoreError
  components/ComparativeView   Tablas comparativas año anterior / actual (las usa también el PDF)
  features/
    extraction/                pipeline, geminiClient, schemas (Zod)
    ratios/                    calculations (23 ratios), sanityChecks, crossCheck
    cases/useCases.ts          CRUD de casos en Firestore
    auth/useAuth.ts            Login con Google
    editing/                   Edición de valores en el dashboard (EditProvider, inputs, SourceDataEditor)
    pdf/generatePDF.ts         Reporte para comité (jsPDF)
  lib/
    gemini.ts                  Modelo, modelo de respaldo, reintentos
    prompts/                   Prompts de extracción, verificación y mercado
```

## Comandos

```bash
npm install
npm run dev        # Vite en http://localhost:3000
npm run lint       # tsc --noEmit
npm run test       # vitest run (tests de src/features/ratios)
npm run build      # build de producción en dist/
npm run preview    # sirve dist/
```

- Variable requerida: `GEMINI_API_KEY` en `.env.local`. Vite la inyecta en el bundle mediante `define`.
- La configuración de Firebase está en `firebase-applet-config.json`.
- Tests con Vitest en `src/features/ratios/*.test.ts`, sobre un balance de ejemplo en `__fixtures__/extraction.ts`. Por ahora solo cubren ratios, sanity checks y cruce Nosis.

## Reglas

- **No cambiar fórmulas de ratios sin tests.** Esto incluye `calculations.ts`, los umbrales de `evaluateRatioStatus`, las palabras clave de rubros, `sanityChecks.ts` y `crossCheck.ts`. Primero se escribe o ajusta el test con el valor esperado calculado a mano, después se cambia la fórmula, y `npm run test` tiene que pasar. Un ratio mal calculado termina en una decisión de crédito.
- **Correr `npm run lint` (y `npm run test` si se tocó `src/features/ratios`) antes de cada commit.** Si falla, no se commitea.
- **Commits chicos y en español**: un cambio lógico por commit, con un mensaje en minúscula que describa qué cambia (por ejemplo: `fix extraccion nosis post cierre y moneda opcional`).
- La IA interpreta y el código calcula. No mover cálculos numéricos a los prompts.
- Si se cambia el schema de extracción, revisar juntos el prompt (`prompts/extraction.ts`), el schema Zod, `calculations.ts`, `ComparativeView`, `generatePDF.ts` y `editing/`.
- No commitear secretos. `.env*` está en `.gitignore`; la API key va en `.env.local`.
