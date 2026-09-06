# recetas-app

App personal (un solo usuario) de recetas y productos de Mercadona con fotos,
cantidades, kcal y macros. TypeScript en todo. Monorepo con npm workspaces.

```
packages/pipeline  → scripts Node/TS (tsx). Corren en mi máquina. Nunca en el navegador.
packages/app       → PWA estática (Vite + TS). Sin backend. GitHub Pages.
packages/shared    → el contrato del dataset (tipos + Zod). Sin lógica.
```

## Arquitectura: dos mitades independientes. No las mezcles.

**A) Pipeline** — corre en mi ordenador. Descarga el catálogo de Mercadona y
genera un dataset versionado.

**B) PWA offline** en GitHub Pages, repo **público**. Consume el dataset y
guarda MIS datos (recetas, favoritos, registro diario) solo en IndexedDB. Tiene
que funcionar sin cobertura dentro del supermercado.

**El único punto de contacto en tiempo de ejecución entre A y B es
`packages/app/public/data/dataset.json`.** La app nunca llama a la API de
Mercadona (y no podría: la API no tiene CORS). El pipeline nunca toca IndexedDB.
`packages/shared` es la definición escrita de la forma de ese fichero y no
contiene lógica de ninguna de las dos mitades.

## RESTRICCIONES DURAS

- **Mercadona no tiene API oficial.** Usamos los endpoints internos de
  `tienda.mercadona.es`. Pueden romperse sin aviso: **valida con Zod toda
  respuesta de la API externa** y falla de forma explícita y legible, nunca en
  silencio. Un error de esquema debe decir qué campo, qué se esperaba y qué
  llegó.
- **Rate limit obligatorio: máximo 1 petición/segundo.** Backoff exponencial en
  los reintentos. Caché en disco entre ejecuciones. **Sin paralelismo**: las
  peticiones salen de una en una, en serie.
- **CP fijado a `18014`** (Granada). Matiz importante y medido: el catálogo de
  la web **no** depende del CP. El frontend de Mercadona usa siempre el almacén
  `vlc1` y el CP solo le sirve para el reparto. Otros almacenes existen y
  cambian precios de fresco, pero no hay forma de saber cuál es el de Granada.
  Ver `ARCHITECTURE.md` § "Código postal y almacén" antes de tocar `WAREHOUSE`.
- **REPO PÚBLICO: NUNCA se commitean fotos de producto, ni volcados crudos, ni
  mis datos personales.** Todo eso al `.gitignore`. En el repo va solo el JSON
  del catálogo con las URLs de las fotos.
- **Todo valor nutricional lleva campo `fuente`**:
  `mercadona | openfoodfacts | generico | manual`.
- **Los datos del catálogo se reemplazan en cada actualización. Mis datos NUNCA
  se sobrescriben.** Separación estricta: son dos bases de datos Dexie
  distintas, no dos tablas de la misma.
- **Referenciar productos por EAN además de por id de Mercadona.**

## Hechos verificados contra la API real (2026-09-06)

No los des por supuestos otra vez, pero tampoco los des por eternos: si algo no
cuadra, comprueba antes de asumir.

- **La API de Mercadona NO devuelve kcal ni macros.** `nutrition_information`
  solo tiene `allergens` e `ingredients`. Verificado en 35 fichas de todas las
  familias de alimentación y en las variantes `?extended=true`, `/api/v1_1/`,
  `?lang=en` y dos rutas `/nutrition/` (404). **El 100% de los macros tendrá
  que venir de Open Food Facts, de un genérico o a mano.**
- El listado de categoría **no trae EAN**: hay que pedir la ficha de cada
  producto. Son ~4.300 fichas ≈ 80 min a 1 req/s la primera vez.
- El CDN de fotos (`prod-mercadona.imgix.net`) **sí manda
  `Access-Control-Allow-Origin: *`** → la PWA puede descargar las fotos y
  cachearlas. La API (`tienda.mercadona.es`) **no** manda CORS.
- Un `?wh=` inválido **se ignora en silencio** y devuelve el catálogo por
  defecto. Valida el almacén, no confíes en que un 200 signifique acierto.
- Rarezas de tipos ya contempladas en los esquemas: `id` de producto es string
  y el de categoría number; los precios son strings; `previous_unit_price`
  viene con espacios de padding; `total_units * pack_size` no cuadra con
  `unit_size` en ~9% de los packs.

## Trabajo futuro (no lo hagas sin que te lo pidan)

Cruce con Open Food Facts, estimación desde alimento genérico, recetas,
favoritos y registro diario son sesiones posteriores. El modelo de datos ya
está preparado para ellos (`packages/shared/src/dataset.ts` y las tablas de
usuario en la PWA), pero la funcionalidad no está escrita.

## Comandos

```bash
npm install
npm run pipeline:fetch     # crawl del catálogo (reanudable, cacheado)
npm run pipeline:build     # volcado crudo → dataset.json + informe
npm run pipeline:update    # fetch + build
npm run app:dev
npm run app:build
```
