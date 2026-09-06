# Arquitectura

App personal de recetas y productos de Mercadona. Un solo usuario, sin backend,
sin cuentas, sin analítica. Todo lo que sabe la app está o en un fichero JSON
estático o en el IndexedDB del navegador.

## Las dos mitades

```
   ┌─────────────────────────────┐            ┌──────────────────────────────┐
   │  A) PIPELINE                │            │  B) PWA                      │
   │  packages/pipeline          │            │  packages/app                │
   │  Node + tsx, en mi máquina  │            │  Vite + TS, GitHub Pages     │
   │                             │            │                              │
   │  tienda.mercadona.es/api    │            │  IndexedDB                   │
   │      ↓ 1 req/s, Zod         │            │   ├── recetas-catalog        │
   │  data/raw/YYYY-MM-DD/  ────┐│            │   │   (se borra y recrea)    │
   │  (gitignored)              ││            │   └── recetas-user           │
   │      ↓ normalización       ││            │       (NUNCA se toca)        │
   └────────────────────────────┼┘            └──────────────────────────────┘
                                │                            ↑
                                └──→ dataset.json ───────────┘
                                     (committeado)
```

**El único punto de contacto en tiempo de ejecución es
`packages/app/public/data/dataset.json`.** El pipeline nunca abre IndexedDB. La
app nunca llama a la API de Mercadona — y aunque quisiera no podría, porque esa
API no manda cabeceras CORS.

`packages/shared` existe como una lectura deliberada de esa regla: es la
definición escrita de la forma de ese fichero (tipos + esquema Zod), sin lógica
de ninguna de las dos mitades. La alternativa era duplicar el contrato en los
dos lados y verlo derivar.

---

## Lo que la API de Mercadona da y lo que no

Todo lo de esta sección está medido contra la API real el **2026-09-06**. No es
una API oficial: puede cambiar sin aviso y estas notas caducan.

### Endpoints

| Endpoint | Para qué |
|---|---|
| `GET /api/categories/` | 26 categorías de nivel 0 con sus 151 subcategorías de nivel 1 |
| `GET /api/categories/{id}/` | Subcategoría con sus hojas de nivel 2 y los productos en formato listado |
| `GET /api/products/{id}/` | Ficha completa. **Única fuente de EAN, fotos, marca e ingredientes** |
| `POST /api/postal-codes/actions/change-pc/` | Valida un CP. Nada más (ver abajo) |

No existen `/api/warehouses/`, `/api/postal-codes/` ni
`/api/products/{id}/nutrition/`. `?extended=true` y `/api/v1_1/products/{id}/`
devuelven byte por byte lo mismo que la ruta normal.

### LIMITACIÓN CONOCIDA: no hay valores nutricionales

`nutrition_information` contiene **solo** `allergens` e `ingredients`. No hay
kcal, ni proteínas, ni grasas, ni hidratos, ni fibra, ni sal.

Comprobado sobre 35 fichas repartidas por yogures, cereales, leche, pizzas,
conservas, aceites, refrescos, carne, pescado, fruta, congelados y bollería, y
sobre las variantes `?extended=true`, `/api/v1_1/`, `?lang=en` y dos rutas
`/nutrition/` inexistentes. La unión de claves de `nutrition_information` en
las 35 fichas es exactamente `["allergens", "ingredients"]`.

**Consecuencia de diseño: el 100% de los macros tiene que venir de fuera.** Por
eso `nutrition` es un objeto anulable con un campo `fuente` obligatorio, y por
eso hoy el informe del pipeline dice «0 productos con datos nutricionales».
Está bien; no es un fallo del crawl.

Lo único adyacente que hay: cada ficha trae varias fotos con un campo
`perspective` (visto 1, 2 y 9), y la 9 parece ser el reverso del envase, donde
está impresa la tabla nutricional. Sacarla de ahí sería OCR. No se ha hecho ni
está previsto.

### El EAN solo está en la ficha

El listado de categoría trae precio, formato y miniatura, pero **no trae EAN**.
Como la restricción es referenciar los productos por EAN además de por id, hay
que pedir las ~3.000 fichas de alimentación una a una. Eso es lo que convierte
el crawl en ~55 minutos la primera vez.

### Formato de envase

Vive entero en `price_instructions`. Distribuciones reales medidas sobre los
4.321 productos del catálogo completo, antes de acotar el scope a
alimentación:

| Campo | Valores |
|---|---|
| `size_format` | `kg` 2419 · `l` 1352 · `ud` 548 · `m` 2 |
| `reference_format` | `kg` 2226 · `L` 847 · `ud` 711 · `100 ml` 404 · `100 g` 98 · `lv` 24 · `dc` 8 · `m` 2 · `dz` 1 |
| `is_pack: true` | 447 |
| `approx_size: true` | 397 (fresco, peso aproximado) |
| `selling_method` | `0` 4314 · `1` 7 (granel) |
| `unit_size` nulo o 0 | 38 |

**Decisión: el contenido neto se calcula solo desde `unit_size` + `size_format`.**
`total_units` y `pack_size` no se usan, porque no cuadran con `unit_size` en 45
de los 484 packs (~9%):

```
22910 Aceitunas rellenas de anchoa  unit_size=1.05  3 × 0.15 = 0.45   (pack_size es el peso escurrido)
64251 Helado cucurucho choco nata   unit_size=0.72  6 × 0.39 = 2.34   (mezclan kg con litros)
```

Se conservan crudos en `rawSize` para poder mirarlos, pero sin autoridad. Los
548 productos con `size_format: "ud"` y los 2 con `"m"` salen con
`netContent: null`: no hay conversión posible a masa ni a volumen.

### Rarezas de tipos

- `id` de producto es **string** (`"4241"`); `id` de categoría es **number**.
- Los precios llegan como **string**: `"3.45"`, `"3.450"`.
- `previous_unit_price` viene con **padding de espacios**: `"       17.75"`.
- `iva` es `null` pero `tax_percentage` es `"4.000"`.
- `details.is_prepared_by_mercadona` aparece en unas fichas y en otras no.
- `extra_info` es `[""]` o `[null]`.

Todo esto está contemplado en `packages/pipeline/src/mercadona/schemas.ts`. Los
números que llegan como string **no** se convierten en el esquema, sino en
`normalize/`, para que el error pueda decir qué producto lo provocó.

### Código postal y almacén

El CP está fijado a **18014** (Granada) en `packages/pipeline/src/config.ts`.
La conclusión, después de medirlo, es que **el catálogo de la web no depende
del código postal**, y conviene entender por qué antes de tocar nada.

Lo que se comprobó:

- `POST /api/postal-codes/actions/change-pc/` **valida** el CP — con `00000`
  responde 404 `"This zip code is outside of our working area"` — pero devuelve
  `{"warehouse_changed": false}` para 46001, 28001 y 08001, con sesión y sin
  ella, y no deja ninguna cookie de almacén. **No revela ningún mapeo.**
- No hay endpoint que liste almacenes (`/api/warehouses/` es 404).
- **El bundle del propio tienda.mercadona.es define un solo almacén**:
  `{VLC1:"vlc1"}`, y lo usa como valor fijo. El CP le sirve para el reparto
  (cookie `__mo_da`), no para elegir catálogo.
- Medido: el catálogo por defecto de la API es **idéntico a `?wh=vlc1`** — en
  *Fruta*, los 53 productos con los 53 mismos precios.
- Otros almacenes existen y **sí** cambian los precios: `?wh=mad1` devuelve los
  mismos 53 productos de *Fruta* pero con **33 precios distintos** (Plátano de
  Canarias 0,41 € contra 0,39 €; Pera Conferencia 0,52 € contra 0,47 €).
  `bcn1` además quita un producto. Existen `mad1`, `mad2`, `bcn1`, `mlg1`,
  `svq1`, `alc1` y `vlc2`.
- **`gra1` y `gra2` no existen.** Un `wh` inválido no da error: se ignora y
  devuelve el catálogo por defecto. `?wh=ZZZ9` responde 200 con normalidad, así
  que un código mal escrito pasaría desapercibido para siempre.

**Conclusión y limitación conocida.** El dataset se descarga con el almacén por
defecto (= `vlc1`), que es exactamente lo que la web de Mercadona le enseña a
cualquiera, también desde Granada. No hay ninguna forma de pedirle a la API el
catálogo de Granada: no se sabe si existe un almacén granadino con código
propio, y desde luego la web no lo usa. **Consecuencia práctica: los precios de
fresco que muestre esta app pueden no coincidir con los de la tienda física de
Granada.** El resto —formatos, EAN, fotos, ingredientes— no depende del
almacén.

Por eso el CP se usa para dos cosas: validar al arrancar el crawl y quedar
registrado en `dataset.source.postalCode`. El almacén es configuración
explícita (`WAREHOUSE`), nunca algo derivado a ojo.
`npm run pipeline:probe-warehouse` compara candidatos contra un código
deliberadamente falso, que es la única manera de distinguir un almacén real de
uno que se ignora en silencio.

### Protección anti-bot

El sitio va detrás de Akamai (cookies `bm_sz` y `_abck`). Todas las peticiones
respondieron 200 sin hacer nada especial, pero el cliente HTTP manda
User-Agent de navegador, mantiene el cookie jar entre peticiones y trata un 403
como «para 60 segundos», no como un error a reintentar deprisa.

---

## Fotos: sí hay CORS

```
GET https://prod-mercadona.imgix.net/images/….jpg
  access-control-allow-origin:   *
  cross-origin-resource-policy:  cross-origin
  timing-allow-origin:           *
  cache-control:                 public, max-age=31536000
OPTIONS → 204, allow-origin: *, allow-methods: GET
```

La PWA puede descargar las fotos y cachearlas. **Offline completo para lo
cacheado**, sin proxy y sin meter una sola imagen en el repo.

Se cachean en **CacheStorage a través de Workbox**, no como blobs en
IndexedDB. El motivo es que las URLs de imgix llevan el hash del contenido y
son inmutables durante un año, así que la caché de fotos sobrevive al borrado y
recreación de la base de datos del catálogo, que ocurre en cada actualización.
Si estuvieran en la BD del catálogo habría que volver a descargarlas cada vez.

La API en cambio **no** manda CORS: `tienda.mercadona.es` con `Origin` devuelve
`access-control-allow-origin: null`. La app nunca podrá hablar con ella
directamente. Es la razón técnica de que la arquitectura sea la que es.

---

## Separación entre el catálogo y mis datos

**RESTRICCIÓN DURA: el catálogo se reemplaza entero en cada actualización; mis
datos no se sobrescriben nunca.**

Se implementa con **dos bases de datos Dexie distintas**, no con dos tablas de
la misma:

| | `recetas-catalog` | `recetas-user` |
|---|---|---|
| Contenido | productos, categorías, metadatos del dataset | recetas, favoritos, registro diario, correcciones manuales |
| En una actualización | se borra y se recrea desde `dataset.json` | no se abre siquiera en escritura |
| Origen | pipeline | solo yo |

Así la regla deja de ser una convención que hay que recordar y pasa a ser
estructural: el cargador del dataset no tiene ninguna razón para abrir la
segunda base, y borrarla entera es una operación segura sobre la primera.

Un corolario que importa: **los valores nutricionales con `fuente: "manual"`
son datos míos y viven en `recetas-user`**, no en el catálogo. Al leer un
producto se resuelve así:

```
corrección manual (recetas-user)  >  nutrición del catálogo (recetas-catalog)
```

Las fuentes `openfoodfacts` y `generico` sí van en el catálogo, porque las
genera el pipeline y son reemplazables.

---

## El dataset

`packages/app/public/data/dataset.json`. **Solo alimentación**: 2.985
productos, **5,24 MB en crudo y 0,59 MB por el cable** (GitHub Pages sirve
gzip). Un solo fichero: a este tamaño trocearlo solo añade complejidad, y
partirlo rompería el objetivo de que todo esté disponible sin cobertura.

Antes de acotar el scope eran 4.321 productos y 7,24 MB. Los 1.336 que se
fueron son cosmética (463), limpieza (341), cabello (177), maquillaje (156),
mascotas (82), parafarmacia (51) y la parte no comestible de Bebé (47), más
Velas y decoración (16) y Hielo (3). Ni se descargan: `fetch` salta esas
subcategorías, y `build` vuelve a filtrar por si el volcado crudo es anterior
al cambio.

Un dato que condiciona el diseño de las recetas: **el 98,1% de los productos
de alimentación tienen precio de referencia y contenido en g/ml**, así que el
coste de una receta y el coste por ración se pueden calcular con exactitud.
Es el único agregado nutricionalmente útil que se puede dar mientras no haya
macros.

De los 5,24 MB, **más de 2 MB son las URLs de las fotos**: cada producto guarda
`thumbnail`, `regular` y `zoom`, que son la misma URL cambiando dos parámetros
de imgix (`h` y `w`). Se dejan enteras y literales a propósito, porque son lo
que devuelve la API y porque la regla del repo es que ahí vayan «las URLs de
las fotos». Guardando solo la clave de imgix y componiendo los tamaños en la
app el fichero bajaría alrededor de un 40% en crudo (por el cable apenas
cambiaría: gzip ya deduplica los prefijos repetidos). Lo que se ganaría es
tiempo de `JSON.parse` y memoria en el móvil, no ancho de banda. Está sin hacer
y es una decisión pendiente, no un olvido.

Solo se commitea la versión más reciente. Los volcados crudos fechados de los
que sale se quedan en `packages/pipeline/data/`, que está en `.gitignore`.

El contrato está en `packages/shared/src/dataset.ts` y lleva `schemaVersion`.
El pipeline valida el dataset contra su propio esquema antes de escribirlo, y
la app lo valida al cargarlo: si la PWA no va a poder leerlo, es mejor
enterarse en mi máquina.

---

## Lo que no está hecho

Cruce con Open Food Facts, estimación desde alimento genérico, recetas,
favoritos y registro diario. El modelo de datos está preparado (`Nutrition` con
su `fuente`, la base `recetas-user`), pero la funcionalidad es de sesiones
posteriores.
