export const EXTRACTION_PROMPT = `
        Analiza los documentos adjuntos. Pueden incluir Estados Contables (Balance) y reportes de deuda (ej. Nosis, Central de Deudores).
        
        TU OBJETIVO ES GENERAR DOS SALIDAS EN UN SOLO JSON:
        1. "data": La extracción contable pura estructurada.
        2. "dashboardData": Un análisis financiero para un dashboard visual.

        REGLAS DE EXTRACCIÓN Y SINÓNIMOS:
        Para poblar las variables deuda_bancaria_corriente y deuda_bancaria_no_corriente, considerá como sinónimos exactos cualquier rubro que figure bajo el nombre de 'Préstamos', 'Préstamos Bancarios', 'Deudas Bancarias' o 'Deudas Financieras'.

        REGLA DE CERTEZA MATEMÁTICA ABSOLUTA:
        Tienes PROHIBIDO inventar, inferir o estimar cualquier ratio financiero.
        SOLO puedes utilizar las cuentas extraídas y validadas. Si un dato no existe en el balance, el resultado del ratio debe ser 'N/A' (No Aplica), no un número inventado.

        Debes calcular los ratios estrictamente con las siguientes fórmulas matemáticas, sin desvíos:
        EBITDA = (resultado_bruto + resultado_valuacion_bienes_de_cambio + depreciacion_bienes_de_uso + resultado_inversiones_permanentes) - (gastos_comercializacion + gastos_administracion)
        Liquidez = activo_corriente / pasivo_corriente
        Liquidez Ácida = (activo_corriente - bienes_de_cambio) / pasivo_corriente
        Endeudamiento = pasivo_total / patrimonio_neto
        Capital de Trabajo = activo_corriente - pasivo_corriente
        Margen EBITDA s/ Ventas = EBITDA / ventas
        Resultados Financieros s/ Ventas = gastos_financieros / ventas
        Cobertura de Intereses = (EBITDA / gastos_financieros) * -1
        Deuda Bancaria Total = deuda_bancaria_corriente + deuda_bancaria_no_corriente
        Deuda Bancaria / EBITDA = Deuda Bancaria Total / EBITDA
        Deuda Bancaria en Días de Ventas = (Deuda Bancaria Total / ventas) * 365
        Rentabilidad = resultado_neto / ventas

        REGLAS ESTRICTAS DE FORMATO Y PRESENTACIÓN VISUAL:
        - Años Dinámicos (Prohibido usar 'Actual/Anterior'): Identificá el año de cierre del balance analizado leyendo la carátula o los encabezados (ej. 2025). Utilizá ese año exacto y el año anterior (ej. 2024) como títulos de las columnas en todas las tablas y comparativas. Nunca uses frases genéricas como 'Ejercicio Actual' o 'Ejercicio Anterior'.
        - Alineación Perfecta (Uso de Markdown): Para garantizar que los valores queden perfectamente alineados en columnas, debes estructurar absolutamente todos los reportes y cuadros comparativos utilizando el formato de Tablas de Markdown puro (usando | y -).
        - Control de Paginación (Formato A4): Para evitar que las tablas queden cortadas a la mitad de una página al imprimir el reporte, debes insertar el texto exacto --- [✂️ SALTO DE PÁGINA RECOMENDADO] --- justo antes de comenzar cualquier tabla que contenga más de 5 filas. Esto servirá como guía visual para la maquetación final.

        CONTENIDO OBLIGATORIO PARA EL INFORME (informe_markdown):
        Al generar el Informe, debes integrar obligatoriamente la siguiente información proveniente de tu cálculo interno (motor_de_ratios), adaptándola a la estructura de redacción que ya posees:
        - Resultados Principales: Ventas Netas, Resultado Neto y EBITDA.
        - Ratios Financieros: Liquidez Corriente, Liquidez Ácida, Capital de Trabajo, Endeudamiento, Rentabilidad s/ Ventas, Margen EBITDA, Cobertura de Intereses, Deuda Bancaria / EBITDA y Deuda en Días de Ventas.
        - Formato: Expresá los montos en pesos, los porcentajes con '%' y los multiplicadores con 'x'.

        Reglas para "dashboardData":
        - Perfil de la Empresa: Extrae el Nombre, CUIT, Actividad Principal, y los años exactos (anio_actual y anio_anterior).
        - Síntesis Ejecutiva (executive_summary): REGLA DE RAZONAMIENTO AVANZADO (HIGH THINKING) PARA LA SÍNTESIS EJECUTIVA:
          Para redactar la 'Síntesis Ejecutiva', debes activar tu máxima capacidad de razonamiento analítico y financiero. NO redactes la conclusión inmediatamente. Antes de escribir, realiza un proceso interno de 'High Thinking' cruzando la información cuantitativa (Estados Contables y Ratios calculados) con la información cualitativa (Memoria del Directorio y Notas al Balance).
          Sigue este proceso de pensamiento para estructurar el texto:
          Contexto Inicial: El primer párrafo debe comenzar OBLIGATORIAMENTE con exactamente tres (3) oraciones que resuman el nombre de la empresa, su antigüedad (si figura) y su 'core business' (actividad principal y mercado en el que opera).
          Contraste: Si la Memoria del Directorio relata un contexto de éxito o expansión, verifica si los números de Ventas, EBITDA y flujos de caja respaldan esa afirmación. Si hay contradicciones, el dato matemático manda.
          Causalidad: No te limites a listar los ratios. Intenta inferir el por qué basándote en la Memoria (ej. 'La liquidez cayó por las fuertes inversiones mencionadas en la Memoria').
          El Veredicto Final: Una vez procesado este cruce, redacta la síntesis en formato de párrafos de texto (NO uses viñetas).
          Reglas de longitud y formato:
          Longitud dinámica: El texto completo debe tener estrictamente entre 150 y 300 palabras. Ajusta el nivel de detalle basándote en la complejidad de la empresa.
          Tono: Frío, objetivo, demostrando una comprensión experta de la salud económica real y filtrando el optimismo infundado de la Memoria.
          Cierre obligatorio: El último párrafo debe comenzar exactamente con la palabra **Conclusión:** (en negrita), seguido de tu dictamen final sobre el perfil de riesgo.
        - Ratios: Calcula Liquidez Corriente (Activo Cte / Pasivo Cte), Solvencia (Patrimonio Neto / Pasivo Total), Deuda/EBITDA (Deuda Financiera / EBITDA), EBITDA/Intereses. 
          * EBITDA = Resultado Operativo + Depreciaciones y Amortizaciones.
          * Asigna un estado ("critical", "alert", "healthy") basado en estándares de mercado conservadores.
        - Cross Check: Si hay un reporte de Nosis/Deuda (busca documentos que parezcan informes de crédito), compara la deuda bancaria total del reporte con la deuda bancaria/financiera del balance. 
          * Si no hay reporte de deuda, devuelve null en "cross_check".
          * "match": true si la diferencia es menor al 10%.
        - Sales Analysis: Analiza la evolución de ventas (comparando ejercicio actual vs anterior).
          * "evolution_text": Breve explicación de la variación real (considerando inflación si es evidente).
          * "projection_text": Proyección simple cualitativa basada en la tendencia y RECPAM.
          * "status": "healthy" si crece en términos reales, "critical" si cae significativamente.
        - Equity Analysis: Analiza la evolución del Patrimonio Neto.
          * "trend_text": Explica si el crecimiento/decrecimiento fue orgánico (por resultados) o por aportes de capital/ajustes.
          * "status": "organic" (si es principalmente por resultados), "contributions" (si es por aportes), "mixed" (ambos), "undefined" (no claro).
        - Post-Closing Analysis: Si detectas información posterior al cierre del balance (ej. ventas posteriores, o deuda bancaria asumida post balance), completa el bloque "analisis_post_cierre".
          * Identifica la fecha exacta del primer registro y del último para completar fecha_inicio y fecha_fin.
          * Extrae las ventas mes a mes. Para cada mes, extrae el monto del año actual ("monto") y, si está disponible, el monto del mismo mes del año anterior ("monto_anio_anterior").
          * Suma todos los montos mensuales del año actual y coloca el resultado en total_ventas_post_cierre.
          * Si se incluye un documento con título "deuda bancaria post balance" o similar, extrae el detalle EXACTO de las deudas asumidas en "deuda_bancaria_post_balance_detalle". Extrae la "entidad", el "monto" (el número exacto que figura en el documento, OJO: verifica si está en miles o en valor nominal y conviértelo a MILES si es necesario para mantener consistencia, o déjalo en nominal si es USD y aclara la moneda), y la "moneda" ("ARS" o "USD").
          * Si no hay información, déjalo como null.
        - Pestaña Nosis: Si se proporciona un archivo o texto de Nosis, debes procesarlo y completar el objeto "extraccion_nosis" y "datos_adicionales_balance".
        - Accionistas y Directorio (accionistas_y_directorio): Si en los documentos subidos (por ejemplo, Memoria, Notas al Balance, Actas de Asamblea, o documentos específicos societarios) existe información sobre la composición accionaria (Cap Table) y/o la conformación del Órgano de Administración (Directorio/Gerencia), extráela.
          * accionistas: Lista de accionistas con 'nombre' (Apellido y Nombre o Razón Social), 'dni_cuit' (si está disponible, sino "N/A"), y 'participacion' (porcentaje numérico, ej. 52.99).
          * REGLA ESTRICTA (SIN LÍMITE DE CANTIDAD): Debes extraer a TODOS los accionistas que posean más del 5% de participación. NO HAY LÍMITE en la cantidad de accionistas a extraer (pueden ser 10, 20 o más). NO OMITAS a ningún accionista que supere este umbral. Asegúrate de extraer exhaustivamente su nombre, DNI/CUIT y el % exacto de participación.
          * IMPORTANTE: Si un accionista es una Persona Jurídica (empresa/sociedad) y se detalla su composición accionaria, debes extraer recursivamente a sus accionistas dentro del campo 'subAccionistas'. Debes hacer esto hasta llegar a los Beneficiarios Finales (personas humanas) o hasta un máximo de 4 niveles de profundidad.
          * directorio: Lista de miembros del directorio con 'cargo' (ej. Presidente, Director Titular) y 'nombre'.
          * Si no se encuentra esta información, puedes omitir este campo o devolver listas vacías.
        - Mercado (analisis_mercado): REGLA DE ANÁLISIS ESTRATÉGICO DE MERCADO (DEEP SEARCH - MUY EXTENDIDO):
          ¡CRÍTICO! El informe DEBE ser extremadamente detallado y profundo. Longitud MÍNIMA OBLIGATORIA: 1500 palabras (aprox. 3 carillas). Si el informe es corto, será rechazado.
          Para alcanzar esta longitud, DEBES desarrollar cada sección con múltiples párrafos, datos estadísticos, ejemplos concretos y un análisis exhaustivo de causas y consecuencias.
          EXCLUYENTE TEMPORAL: Absolutamente toda la información, datos, normativas y proyecciones DEBEN ser posteriores a 2025 (es decir, correspondientes al año 2026 en adelante). Se anulará el reporte si se detectan estadísticas obsoletas.
          Contexto Específico y Competencia: Identifica la actividad de la empresa. Analiza la estructura de ese mercado específico en Argentina, principales competidores (menciona nombres reales), barreras de entrada, cuota de mercado, y cadena de valor.
          Análisis Macroeconómico Sectorial: Detalla cómo las variables actuales (inflación, tipo de cambio, regulaciones del BCRA, políticas gubernamentales de 2026) impactan específicamente a la estructura de costos, precios, y ventas de este sector.
          Proyecciones: Busca y sintetiza perspectivas para los próximos 12-24 meses. Incluye escenarios optimistas y pesimistas.
          Comercio Exterior (Condicional): Si el balance o la memoria indican que la empresa exporta o importa, realiza un análisis del mercado internacional, precios de commodities relevantes, logística, o tendencias globales de ese rubro.
          Estructura de Secciones (OBLIGATORIO): Organiza el contenido estrictamente con los siguientes títulos (en formato Markdown ###). Cada sección debe tener al menos 3 o 4 párrafos extensos:
          ### PANORAMA DEL SECTOR EN ARGENTINA
          ### ANÁLISIS DE COMPETENCIA Y CADENA DE VALOR
          ### IMPACTO MACROECONÓMICO Y REGULATORIO
          ### PERSPECTIVAS Y PROYECCIONES SECTORIALES
          ### ANÁLISIS DE MERCADOS INTERNACIONALES (Si no aplica, indica "No aplica")
          
          REGLA ESTRICTA CONTRA ALUCINACIONES: PROHIBIDO INVENTAR FUENTES, LINKS O CITAS. 
          Realiza el análisis del mercado BASADO ÚNICAMENTE EN TU CONOCIMIENTO GENERAL Y LA INFORMACIÓN DE LOS DOCUMENTOS ADJUNTOS. No debes crear noticias falsas, no inventes reportes de consultoras ni artículos que no existen. Si no tienes datos reales verificables, utiliza tu conocimiento conceptual sin atribuirlo a informes específicos falsos. Omite por completo la sección de referencias o no coloques URLs inventadas. No incluyas la sección de Referencias y Fuentes Consultadas.
        - Informe Markdown: Genera un reporte detallado en Markdown en el campo "informe_markdown" aplicando todas las REGLAS ESTRICTAS DE FORMATO Y PRESENTACIÓN VISUAL y el CONTENIDO OBLIGATORIO PARA EL INFORME.

        INCLUSIÓN DE NOSIS EN EL REPORTE FINAL:
        Dentro del Reporte Ejecutivo, debes incluir obligatoriamente la sección de antecedentes crediticios, armando la tabla de entidades financieras en formato Markdown (con la primera columna alineada a la izquierda y el resto a la derecha usando ---:):

        | Entidad | Situación | Monto de Deuda |
        | :--- | ---: | ---: |
        | Banco Galicia | 1 | $ 1.500.000 |
        | Banco Santander | 2 | $ 500.000 |

        CRUCE DE DEUDA (BALANCE VS NOSIS):
        Debes comparar la Deuda Bancaria Total del Balance (Pasivo Corriente + No Corriente) contra la Deuda Total informada en Nosis.
        Si la diferencia es mayor al 10%, debes resaltarlo en el informe con un mensaje de ALERTA (usando negritas y emojis ⚠️).
        Si existe Deuda Post Balance en las notas, debes mencionarla como atenuante o agravante de la diferencia.

        LÓGICA DE DESGLOSE PATRIMONIAL (ESTRUCTURA ANIDADA Y DINÁMICA):
        Dentro de la sección "hoja_estado_situacion_patrimonial", organizá la información utilizando niveles de despliegue jerárquicos. Si el balance presenta rubros adicionales a los listados, incluilos en su sección correspondiente.
        
        REGLAS DE ORO:
        - Escala: Todos los valores monetarios deben estar en miles de pesos (dividir por 1.000 y sin centavos). Ejemplo: $1.250.300,50 -> 1250.
        - Los ratios NO se dividen por mil, deben mantener sus decimales originales.

        Estructura JSON esperada (RESPETA ESTRICTAMENTE):
        {
          "data": {
            "hoja_estado_situacion_patrimonial": {
              "titulo_referencia": "string",
              "ejercicio_actual": {
                "activo": {
                  "activo_corriente": {
                    "total": 0,
                    "detalles": [ { "rubro": "Caja y Bancos", "monto": 0 }, { "rubro": "Inversiones", "monto": 0 }, { "rubro": "...", "monto": 0 } ]
                  },
                  "activo_no_corriente": {
                    "total": 0,
                    "detalles": [ { "rubro": "Bienes de Uso", "monto": 0 }, { "rubro": "...", "monto": 0 } ]
                  },
                  "total_del_activo": 0
                },
                "pasivo": {
                  "pasivo_corriente": {
                    "total": 0,
                    "detalles": [ { "rubro": "Cuentas por Pagar", "monto": 0 }, { "rubro": "...", "monto": 0 } ]
                  },
                  "pasivo_no_corriente": {
                    "total": 0,
                    "detalles": [ { "rubro": "Deudas Bancarias", "monto": 0 }, { "rubro": "...", "monto": 0 } ]
                  },
                  "total_del_pasivo": 0
                },
                "patrimonio_neto_total": 0
              },
              "ejercicio_anterior": {
                "activo": {
                  "activo_corriente": { "total": 0, "detalles": [] },
                  "activo_no_corriente": { "total": 0, "detalles": [] },
                  "total_del_activo": 0
                },
                "pasivo": {
                  "pasivo_corriente": { "total": 0, "detalles": [] },
                  "pasivo_no_corriente": { "total": 0, "detalles": [] },
                  "total_del_pasivo": 0
                },
                "patrimonio_neto_total": 0
              }
            },
            "hoja_estado_resultados": {
              "titulo_referencia": "string",
              "ejercicio_actual": {
                "ventas_netas": 0,
                "costo_de_ventas": 0,
                "resultado_bruto": 0,
                "resultado_valuacion_bienes_de_cambio": 0,
                "gastos_administracion": 0,
                "gastos_comercializacion": 0,
                "resultado_inversiones_permanentes": 0,
                "resultado_ordinario": 0,
                "resultado_financiero_y_por_tenencia": 0,
                "resultado_del_ejercicio_final": 0
              },
              "ejercicio_anterior": {
                "ventas_netas": 0,
                "costo_de_ventas": 0,
                "resultado_bruto": 0,
                "resultado_valuacion_bienes_de_cambio": 0,
                "gastos_administracion": 0,
                "gastos_comercializacion": 0,
                "resultado_inversiones_permanentes": 0,
                "resultado_ordinario": 0,
                "resultado_financiero_y_por_tenencia": 0,
                "resultado_del_ejercicio_final": 0
              }
            },
            "hoja_evolucion_patrimonio_neto": {
              "titulo_referencia": "string",
              "ejercicio_actual": { "capital_social_cooperativo": 0, "ajuste_capital_cooperativo": 0, "reserva_legal": 0, "reserva_especial_art42": 0, "resultados_no_asignados": 0 },
              "ejercicio_anterior": { "capital_social_cooperativo": 0, "ajuste_capital_cooperativo": 0, "reserva_legal": 0, "reserva_especial_art42": 0, "resultados_no_asignados": 0 }
            },
            "hoja_flujo_efectivo": {
              "titulo_referencia": "string",
              "ejercicio_actual": { "depreciacion_bienes_de_uso": 0, "flujo_neto_actividades_operativas": 0 },
              "ejercicio_anterior": { "depreciacion_bienes_de_uso": 0, "flujo_neto_actividades_operativas": 0 }
            },
            "analisis_post_cierre": {
              "periodo_analizado": {
                "fecha_inicio": "AAAA-MM-DD",
                "fecha_fin": "AAAA-MM-DD"
              },
              "detalle_ventas_mensuales": [
                { "mes": "string", "monto": 0, "monto_anio_anterior": 0, "moneda": "string" }
              ],
              "total_ventas_post_cierre": 0,
              "notas_relevantes": "string",
              "deuda_bancaria_post_balance_detalle": [
                { "entidad": "string", "monto": 0, "moneda": "string" }
              ]
            }
          },
          "dashboardData": {
            "company_profile": {
              "name": "string",
              "cuit": "string",
              "activity": "string",
              "anio_actual": "string",
              "anio_anterior": "string"
            },
            "ratios": [
              { "name": "Liquidez Corriente", "value": 0, "status": "healthy", "description": "string" },
              { "name": "Solvencia", "value": 0, "status": "alert", "description": "string" },
              { "name": "Deuda / EBITDA", "value": 0, "status": "critical", "description": "string" },
              { "name": "EBITDA / Intereses", "value": 0, "status": "healthy", "description": "string" }
            ],
            "motor_de_ratios": {
              "ebitda": 0,
              "ebitda_anterior": 0,
              "liquidez": 0,
              "liquidez_anterior": 0,
              "liquidez_acida": 0,
              "liquidez_acida_anterior": 0,
              "endeudamiento": 0,
              "endeudamiento_anterior": 0,
              "capital_de_trabajo": 0,
              "capital_de_trabajo_anterior": 0,
              "margen_ebitda_ventas": 0,
              "margen_ebitda_ventas_anterior": 0,
              "resultados_financieros_ventas": 0,
              "resultados_financieros_ventas_anterior": 0,
              "cobertura_intereses": 0,
              "cobertura_intereses_anterior": 0,
              "deuda_bancaria_total": 0,
              "deuda_bancaria_total_anterior": 0,
              "deuda_bancaria_ebitda": 0,
              "deuda_bancaria_ebitda_anterior": 0,
              "deuda_bancaria_dias_ventas": 0,
              "deuda_bancaria_dias_ventas_anterior": 0,
              "rentabilidad": 0,
              "rentabilidad_anterior": 0
            },
            "cross_check": {
              "nosis_debt": 0,
              "balance_debt": 0,
              "match": true,
              "difference": 0,
              "status": "healthy"
            },
            "sales_analysis": {
              "evolution_text": "string",
              "projection_text": "string",
              "status": "healthy"
            },
            "equity_analysis": {
              "trend_text": "string",
              "status": "organic"
            },
            "executive_summary": "string",
            "informe_markdown": "string",
            "extraccion_nosis": {
              "score_crediticio": 0,
              "situacion_bcra_peor_estado": 0,
              "cheques_rechazados_cantidad": 0,
              "cheques_rechazados_monto": 0,
              "deuda_financiera_total_nosis": 0,
              "detalle_entidades": [
                {
                  "entidad": "string",
                  "situacion": 0,
                  "monto": 0
                }
              ]
            },
            "datos_adicionales_balance": {
              "deuda_bancaria_post_balance": 0
            },
            "analisis_mercado": "string",
            "accionistas_y_directorio": {
              "accionistas": [
                {
                  "nombre": "string",
                  "dni_cuit": "string",
                  "participacion": 0,
                  "subAccionistas": [
                    {
                      "nombre": "string",
                      "dni_cuit": "string",
                      "participacion": 0,
                      "subAccionistas": [
                        {
                          "nombre": "string",
                          "dni_cuit": "string",
                          "participacion": 0,
                          "subAccionistas": [
                            {
                              "nombre": "string",
                              "dni_cuit": "string",
                              "participacion": 0
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ],
              "directorio": [
                {
                  "cargo": "string",
                  "nombre": "string"
                }
              ]
            }
          }
        }
      `;
