# CLAUDE.md

## Qué hace la app

Herramienta interna de **análisis de riesgo crediticio para BiBank**. El analista sube los estados contables de una empresa (PDF o imágenes), más el informe Nosis y documentación post balance si la tiene, y la app:

1. **Extrae** con Gemini los datos del balance, el estado de resultados, la deuda bancaria, las ventas post cierre, el informe Nosis/BCRA y los accionistas y directorio.
2. **Calcula 27 ratios en código**, sin IA (`src/features/ratios/calculations.ts`), además de chequeos de consistencia contable y un cruce de deuda Balance vs Nosis.
3. **Verifica y redacta** con Gemini: interpreta los ratios ya calculados, explica las inconsistencias y genera el resumen ejecutivo.
4. Genera en paralelo un **análisis de mercado** del sector y la **historia y actividad de la empresa**, leída de la Memoria del balance.
5. Como último paso, da una **opinión de riesgo integral** con puntaje 1–100 (1 = riesgo mínimo).

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
| 5. Opinión de riesgos (último paso) | **No se lanza sola.** El analista confirma el rubro (portón) y, cuando terminó de revisar, la genera con el botón del banner. Reglas fijas detectan señales con el perfil del rubro (`risk/signals.ts`, algunas con **piso**); Gemini hace la lectura integral empezando por los KPIs del rubro; el código pondera con los pesos del perfil y aplica el piso (`risk/score.ts`) → puntaje 1–100. Se guarda la foto del perfil y la versión de la política. Solo texto, no reenvía archivos | `risk/assessment.ts`, contexto en `risk/contextoOpinion.ts`, prompt en `riskOpinion.ts`, vista en `components/RiskOpinionView.tsx` | Se avisa; el caso queda sin opinión y se puede volver a generar |
| 4b. Historia y actividad | En paralelo, como el mercado. Lee la Memoria: **core business** (lo principal), historia, datos relevantes, proyecciones y explicaciones del balance. Salida validada con `CompanyHistorySchema` | `runCompanyHistory`, prompt en `companyHistory.ts`, vista en `components/CompanyHistoryView.tsx` | Se loguea y el caso queda sin historia |

Puntos clave:
- **Los números los calcula el código, no la IA.** El prompt de verificación le prohíbe a Gemini recalcular o proponer otros valores.
- Las llamadas a Gemini pasan por `callGemini`, que reintenta con espera creciente los errores 429/5xx y, si no alcanza, usa un modelo de respaldo. La configuración está en `src/lib/gemini.ts`.
- **Schemas tolerantes:** `src/features/extraction/schemas.ts` convierte "N/A", "", null, NaN, etc. en `null` para que la validación no se caiga por variaciones del modelo.
- **Persistencia:** `src/features/cases/useCases.ts`, en `users/{uid}/cases/{caseId}`. `extraction`, `ratios`, `inconsistencias`, `crossCheck` y `verification` se guardan como **strings JSON**. Al cargar un caso, ratios, sanity checks y cruce Nosis **se recalculan** desde la extracción: los casos viejos siempre usan las fórmulas y la política vigentes. Al entrar por primera vez con el schema v2 se borran los casos v1 de ese usuario.
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
    ratios/                    calculations (27 ratios: incluye DSCR, deuda neta/EBITDA, calidad de la ganancia), sanityChecks, crossCheck
    risk/                      policy (umbrales y perfiles por rubro), signals (reglas), score (puntaje y PCE), assessment (opinión integral),
                               sector (sugerencia de rubro), porton (confirmación del rubro), contextoOpinion, avisoPerfil, prechequeo
    sectorDocs/                Documentos sectoriales (reporte de mora): tipos, schemas tolerantes, vigencia
    nosis/evolucion.ts         Serie mensual de deuda en el sistema (Central de Deudores): total, por entidad, variaciones. Nominal, sin ajuste por inflación
    accionistas/estructura.ts  Cadena societaria: participación indirecta, quiénes quedan al final de cada cadena, cruce directorio-accionistas
    cases/useCases.ts          CRUD de casos en Firestore
    auth/useAuth.ts            Login con Google
    editing/                   Edición de valores en el dashboard (EditProvider, inputs, SourceDataEditor)
    pdf/generatePDF.ts         Reporte para comité (jsPDF)
  lib/
    gemini.ts                  Modelo, modelo de respaldo, reintentos
    prompts/                   Prompts de extracción, verificación y mercado
```

## Marca (manual de BiBank)

- **Tokens en `src/index.css`** (`@theme`): `ink` (#000), `brand-green` (#35EEC8), `brand-blue`, `brand-magenta`, `canvas`, `panel`. Usar las clases de token (`text-ink/60`, `bg-brand-green`), nunca hex sueltos.
- **Tipografía:** Inter es la base (UI, texto, tablas, números con cifras tabulares); Poppins (`font-display`) para títulos grandes. Texto alineado a la izquierda: nunca justificado ni centrado en párrafos.
- **El verde institucional es identidad, no estado.** Va en el logo, en las acciones principales (botones pill verdes con texto negro) y en los acentos. Para "sano / alerta / crítico" se usa la paleta de estados de `components/riskColors.tsx`, siempre con ícono y etiqueta.
- **Azul de marca = modo edición** y avisos informativos; el ámbar queda solo para advertencias.
- **Logo:** `components/BiBankLogo.tsx` (variantes `dark` / `light`, `full` / `icon`). No recolorear ni deformar; respetar la zona de seguridad.
- **PDF:** `features/pdf/pdfFonts.ts` incrusta Inter y Poppins (`src/assets/fonts`, licencia OFL) en un chunk aparte que solo se descarga al generar el informe; si falla, usa Helvetica.

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
- Tests con Vitest junto a cada módulo (`src/features/**/*.test.ts`): ratios, sanity checks y cruce Nosis (sobre el balance de ejemplo de `ratios/__fixtures__/extraction.ts`), riesgo, proyecciones, evolución Nosis y estructura societaria.

## Reglas

- **Política de riesgos: `src/features/risk/policy.ts` es la fuente única** de semáforos de ratios, reglas con severidad y piso, pesos, bandas y tramos de pérdida esperada. La usan `calculations.ts`, `signals.ts`, `score.ts` y la página "Política de riesgos" de la app (`components/RiskPolicyView.tsx`). Nunca hardcodear un umbral fuera de ese archivo. Hoy es una propuesta inicial a validar con el área de Riesgos; cambiarla sigue la regla de fórmulas: con tests.
- **Proyecciones (`src/features/projections`) sin IA.** Flujo de fondos para capacidad de repago 100% en código: `model.ts` (proyección, punto de quiebre, margen para deuda nueva), `defaults.ts` (supuestos sugeridos con su fuente; si falta un dato, vacío con aviso, nunca un default silencioso). Todo en pesos del cierre del balance: el balance no se toca, lo posterior al cierre se lleva a esa moneda con la inflación que carga el analista. Se guarda solo lo editado (`proyecciones` en el caso), nunca la extracción. Los parámetros fijos están en `PROJECTION_PARAMS` de la política. Cambios al modelo: con tests, como los ratios.
- **Nunca mostrar datos inventados.** Si un dato no se extrajo, se muestra vacío o con un aviso ("no se encontró en la documentación"), nunca un ejemplo que parezca real.
- **Perfiles por rubro (`SECTOR_PROFILES` en `policy.ts`).** El rubro lo decide el analista: `risk/sector.ts` solo sugiere por palabras clave (también en la política) y `risk/porton.ts` tiene la confirmación, el motivo obligatorio si cambia el sugerido y el estado de la opinión. Sin rubro confirmado no hay semáforos, señales, puntaje, opinión ni PDF. El perfil "Genérico" tiene que dar exactamente lo mismo que la política única (`regresion-generico.test.ts`: no se actualiza el snapshot sin revisar la diferencia). Los ratios que no aplican no tienen semáforo y su señal no suma.
- **Financiera es un modelo distinto, no un ajuste de umbrales** (`modelo: 'financiera'` en el perfil). Ratios en `ratios/financieras.ts` (mora, cobertura, PN ajustado, liquidez a 90 días, fondeo, eficiencia…), con sub-segmento obligatorio que fija la mora. Sus umbrales son inclusivos (≥ / ≤); los demás rubros mantienen la regla estricta. El bloque `extraccion_financiera` de los EECC se extrae a demanda (hay que volver a subir el balance: la app no guarda archivos).
- **Documentos sectoriales** (`features/sectorDocs`, prompts en `lib/prompts/sectorDocs.ts`): genéricos por tipo, registrados por perfil en `policy.ts`. Son información declarada por el cliente, no auditada: pueden cambiar la opinión pero **nunca bajan un piso** (una señal con piso que dispara el balance se mantiene aunque el documento sea más favorable). Se guarda lo extraído, no el archivo. Máximo 3 por caso; cargarlos, editarlos o borrarlos deja la opinión desactualizada.
- **Excel y CSV** se convierten a texto en el navegador (`lib/planillas.ts`, SheetJS desde su CDN oficial) antes de mandarlos a Gemini.
- **Versionado de la política.** `POLICY_VERSION` y `POLICY_CHANGELOG` en `policy.ts`; `policy.test.ts` compara un hash de umbrales, señales, pesos, perfiles y palabras clave: si cambian, se sube la versión y se registra el hash nuevo. Cada opinión guarda la foto del perfil y la versión; las vistas y el PDF de un caso evaluado usan esa foto. Las opiniones anteriores al versionado cuentan como genérico v1.0.0.
- **La Opinión de riesgos es la única fuente del dictamen.** El resumen ejecutivo (verificación) no da conclusión ni calificación; los resúmenes viejos se muestran sin su párrafo de "Conclusión" (`risk/summary.ts`).
- **No cambiar fórmulas de ratios sin tests.** Esto incluye `calculations.ts`, los umbrales de `evaluateRatioStatus`, las palabras clave de rubros, `sanityChecks.ts` y `crossCheck.ts`. Primero se escribe o ajusta el test con el valor esperado calculado a mano, después se cambia la fórmula, y `npm run test` tiene que pasar. Un ratio mal calculado termina en una decisión de crédito.
- **Correr `npm run lint` (y `npm run test` si se tocó `src/features/ratios`) antes de cada commit.** Si falla, no se commitea.
- **Commits chicos y en español**: un cambio lógico por commit, con un mensaje en minúscula que describa qué cambia (por ejemplo: `fix extraccion nosis post cierre y moneda opcional`).
- La IA interpreta y el código calcula. No mover cálculos numéricos a los prompts.
- Si se cambia el schema de extracción, revisar juntos el prompt (`prompts/extraction.ts`), el schema Zod, `calculations.ts`, `ComparativeView`, `generatePDF.ts` y `editing/`.
- No commitear secretos. `.env*` está en `.gitignore`; la API key va en `.env.local`.
