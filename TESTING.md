# Pruebas que protegen funcionalidades

La suite busca detectar regresiones en el chat y la memoria. El porcentaje global de líneas no determina si un cambio puede entrar. Cada caso debe proteger una decisión de producto, una frontera entre usuarios, una transición de estado o un fallo recuperable.

## Qué cambió

Antes había dos archivos de tests del backend ejecutados con `tsx --test`, sin comando de tests en la raíz ni pruebas de web o móvil. Los handlers de Convex recibían una base artesanal que ignoraba los índices y no validaba argumentos ni documentos. Esa base podía dejar pasar consultas incorrectas y datos que Convex rechaza.

Ahora hay proyectos Vitest separados para web y backend. Las funciones públicas, internas y HTTP de Convex ejecutan el código de producción sobre `convex-test`, con el schema, índices, autenticación y scheduler simulados. Web usa React Testing Library, jsdom y user-event. Móvil usa Jest 29 con el preset del SDK Expo 57 y React Native Testing Library 14, cuya API de render y eventos es async. El backend Python tiene su propia suite pytest en `synapse-cortex`.

Vitest 4 sigue el formato `projects` documentado por Convex. La aplicación conserva Vite 5 y su configuración de build; el runner tiene su propia configuración. El preset de Expo determina la familia de Jest compatible. Actualizar todos los runners a su último major no aporta confianza por sí solo.

## Ejecutar

Usar Node 24.15 o posterior en la rama 24 y npm 11.9.0. El lockfile fija las dependencias JS.

```bash
npm ci
npm run verify                # formato + lint + tipos + todos los tests
npm run verify:build          # verify + build de producción web; no despliega
npm run format                # aplica formato
npm run lint:fix              # aplica fixes seguros; revisar el diff
npm test                      # web + Convex + móvil, una sola ejecución
npm run test:web
npm run test:backend
npm run test:mobile
npm run typecheck             # TypeScript de los tres workspaces
npm run test:watch            # watch de web + Convex
npm run test:watch --workspace=@synapse/mobile
npm run test:web -- -t 'restores the draft'
npm run test:backend -- -t 'manual consolidation'
npm run test:coverage         # informes HTML y LCOV, sin umbral global
```

El informe Vitest queda en `coverage/index.html` y el de móvil en `coverage/mobile/index.html`. Los archivos de prueba están junto al código de frontend. Los de backend están en `packages/backend/tests`, fuera de las funciones que se despliegan. Cada fixture de Convex crea una base nueva y se identifica explícitamente como propietario, desconocido o anónimo.

Por ahora los checks se ejecutan manualmente en local. Antes de cada commit, correr `npm run verify`. No hay workflows de CI ni hooks de commit; el despliegue no ejecuta la suite automáticamente. Ningún test requiere Clerk, Convex Cloud, un simulador móvil o claves de proveedores.

## Checks para desarrollo con agentes

ESLint usa una configuración compartida para los tres workspaces y falla ante errores o warnings. Detecta variables sin uso, hooks mal declarados, promesas sin manejar, usos async incorrectos, `await` sobre valores no async y switches incompletos sobre uniones. Las reglas de Convex comprueban validadores de argumentos, sintaxis de funciones y fronteras de runtime. Las reglas que necesitan tipos se aplican al código de producción; los tests también pasan el lint básico y el chequeo de TypeScript.

Los handlers JSX y callbacks de Alert de React Native pueden ser async, pero deben manejar sus propios errores. `void` expresa que no se espera el resultado: no captura rechazos. Las vibraciones son opcionales y su helper absorbe fallos del dispositivo; los errores de operaciones relevantes conservan su manejo en el flujo correspondiente.

Prettier controla el formato del código, configuración, CSS y traducciones. Se excluyen archivos generados, builds, proyectos nativos y lockfiles. No se exige eliminar todos los `any` existentes: esa migración necesita criterio por cada frontera de SDK/API. `AGENTS.md` pide definir el comportamiento, añadir un test cuando importe, correr los checks y reportar resultados reales.

`verify:build` valida solamente el build web. La suite móvil y su TypeScript se comprueban en `verify`; instalar/exportar/probar en un dispositivo es una validación adicional según el cambio. Los checks locales ayudan mientras se ejecuten; todavía no hay un gate remoto que impida subir un commit sin verificarlos.

## Contratos protegidos

| Área | Regresión que debe detectar |
| --- | --- |
| Envío web y móvil | Texto recortado, borrador restaurado tras fallo, inicio del stream correcto, bloqueo por generación y cuota |
| Adjuntos web | Envío sin texto, preview válido después de un fallo, liberación de URLs al enviar o desmontar |
| Edición móvil | Reutilizar el mensaje existente, conservar la edición tras fallo y salir solamente al tener éxito |
| Estado del chat web | Contenido local durante streaming y contenido persistido como autoridad al terminar |
| Transporte web y móvil | UTF-8 fragmentado en web, progreso y texto final en XHR, cuota HTTP, desconexión sin sobrescribir el resultado del servidor |
| Propiedad de los datos | Otro usuario no puede leer, enviar, editar, borrar, reintentar, consolidar ni generar sobre un hilo ajeno |
| Mensajes Convex | Pares coherentes, edición del último turno, rechazo durante generación, borrado del par y paginación por hilo/sesión |
| Modelos y evaluación ciega | Modelo congelado por turno, reintento con el mismo modelo, preferencias ocultas y metadatos internos redactados |
| Endpoint HTTP | Contexto y persistencia reales, SSE partido byte a byte, fallback Gemini, ausencia de fallback OpenRouter, conservación de respuesta parcial y contabilización de uso |
| Sesiones | Rotación por inactividad, snapshot de instrucciones, rescheduling, consolidación sin duplicados y carrera con ingestión |
| Planes | Límites free/pro, agotamiento de tokens, bloqueo de reintentos/ediciones, reset UTC y plan ilimitado |
| Perfil | Actualizar el nombre sin pasar claves reservadas de PostHog por Convex |

Los tests nuevos reprodujeron fallos concretos antes de corregirlos: Enter ignoraba el límite diario, las previews se revocaban antes de conocer el resultado del envío, el cleanup capturaba una lista vacía y `updateProfile` pasaba `$set` al scheduler. Convex prohíbe esa clave. La acción de analítica ahora construye `$set` después de recibir `personProperties`.

## Escribir el siguiente test

1. Nombrar el comportamiento y el riesgo. Por ejemplo, "una consolidación repetida no duplica la ingestión".
2. Preparar el estado mínimo. Usar `chatFixture` para funciones Convex y renderizar el componente real para una interacción de frontend.
3. Ejecutar la API o interacción que usa el cliente.
4. Comprobar el resultado visible y los efectos persistidos. Ante un rechazo, comprobar también que la historia permanece intacta.
5. Para arreglar un bug, reproducirlo con un test que falle antes del cambio y pase después.

Mockear las fronteras externas: fetch hacia Cortex, XHR nativo, Clerk, R2/upload y telemetría. Evitar reemplazar la base de Convex, el algoritmo bajo prueba o el componente principal por otra implementación. Las suscripciones Convex de los componentes se controlan en el test; las funciones del backend se ejecutan en sus propias pruebas.

En Convex, el reloj es falso y las llamadas inesperadas a fetch fallan. `vi.setSystemTime` cambia la fecha sin ejecutar tareas programadas; sirve para probar límites y reglas de inactividad. Cuando el objetivo sea probar que el scheduler ejecuta una tarea, avanzar timers y esperar `finishInProgressScheduledFunctions`, sustituyendo antes cualquier servicio externo que pueda invocar.

Usar roles, etiquetas y acciones del usuario. Evitar snapshots masivos, asserts sobre clases CSS, IDs internos o cantidades de llamadas sin significado. El catálogo de modelos es un contrato explícito del producto; sus modelos admitidos sí se comprueban.

## Lo que todavía falta

Esta suite no prueba un navegador conectado ni un dispositivo real. `convex-test` simula Convex y no reproduce sus límites operativos ni todas las carreras concurrentes. Las cargas R2, los permisos de fotos, Neo4j y los proveedores LLM siguen requiriendo pruebas de contrato o integración aparte.

Las siguientes inversiones, por riesgo, son:

1. Borrado de cuenta y de hilo: cascadas completas y recuperación ante errores externos.
2. Procesador de trabajos Cortex: backoff, estados terminales, polling y correcciones de memoria.
3. Exportación e importación de correcciones Notion, especialmente idempotencia y fallos parciales.
4. Unos pocos recorridos completos: login, enviar/recargar/reintentar y consolidar memoria. Playwright para web y un runner de dispositivo para Expo.
5. Evaluaciones separadas de calidad de recuerdos y respuestas. Los unit tests no demuestran calidad de un LLM ni recall semántico real.

No perseguir cobertura de componentes decorativos o todas las traducciones. Consultar el informe para localizar riesgos sin tests, no para llenar las líneas rojas.

## Referencias

- [Convex: convex-test y configuración con Vitest projects](https://docs.convex.dev/testing/convex-test)
- [Vitest: proyectos con entornos separados](https://vitest.dev/guide/projects)
- [Testing Library: pruebas desde el uso del software](https://testing-library.com/docs/guiding-principles/)
- [Expo: Jest y pruebas de componentes](https://docs.expo.dev/develop/unit-testing/)
