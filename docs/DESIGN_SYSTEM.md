# Design System & UI Specification: `light-weight`

Guía fundacional de diseño visual, ergonomía y especificación de pantallas para `light-weight`. Diseñado bajo una estética **OLED Pure Black**, priorizando la ergonomía táctil en entrenamientos de alta intensidad y un acabado de alta gama inspirado en `apple-design`, `ui-ux-pro-max` y la filosofía de `emil-design-eng`.

---

## 1. Principios Fundacionales de Diseño

1. **OLED Pure Black (#000000) & Elevación por Luminancia:**  
   En fondos negros puros las sombras proyectadas son invisibles. La jerarquía se expresa mediante sutiles incrementos de luminosidad en cada superficie superpuesta y bordes finos translúcidos (`1px solid rgba(255, 255, 255, 0.08)`).
2. **Gym-First Ergonomics (Zona del Pulgar & Alta Frecuencia):**  
   Los atletas operan la app con manos fatigadas, temblorosas o sudorosas. Todo control crítico (completar serie, saltar descanso, cambiar peso) tiene una zona de toque mínima de **48×48 px** y se ubica en el tercio inferior de la pantalla.
3. **Legibilidad de Alta Tensión (Tabular Nums & Zero Clutter):**  
   Los datos numéricos (kilos, repeticiones, segundos) utilizan obligatoriamente fuentes de espaciado tabular (`font-variant-numeric: tabular-nums`) para evitar oscilaciones visuales al actualizarse en vivo.
4. **Física Táctil y Respuesta Inmediata:**  
   Transiciones directas y elásticas (120ms – 180ms) con retroalimentación inmediata (`active:scale-[0.98]`). Sin pantallas bloqueantes ni modales lentos durante la sesión activa.

---

## 2. Tokens de Diseño

### Paleta de Colores

```text
Superficies y Fondos:
├─ Canvas (Base pantalla):       #000000 (Black OLED)
├─ Card Surface (Layer 1):       #0C0C0E (Gris ultra oscuro neutro)
├─ Elevated / Inputs (Layer 2):   #18181B (Zinc 900)
├─ Popover / Toolbars (Layer 3):  #27272A (Zinc 800)
└─ Floating Glass:               rgba(12, 12, 14, 0.82) + backdrop-blur-md

Bordes y Divisores:
├─ Border Subtle:                rgba(255, 255, 255, 0.08)
├─ Border Active / Focus:        rgba(255, 255, 255, 0.20)
└─ Border Highlight:             rgba(255, 255, 255, 0.40)

Tipografía y Contraste:
├─ Text Primary:                 #F4F4F5 (Zinc 100 - 95% luminancia)
├─ Text Secondary:               #A1A1AA (Zinc 400 - notas y referencias)
├─ Text Muted / Labels:          #71717A (Zinc 500 - unidades "kg", "reps")
└─ Text Disabled:                #3F3F46 (Zinc 700)

Acentos Funcionales:
├─ Primary / Energy (CTA):       #F59E0B (Amber 500) / #FB923C (Orange 400)
├─ Success / Completed / PR:     #10B981 (Emerald 500)
├─ Rest Timer / Cadence:         #38BDF8 (Sky 400)
└─ Destructive / RPE 10 / Fail:  #EF4444 (Red 500)
```

### Tipografía

* **Display / Títulos:** Sans-serif moderna y limpia (Inter, Geist Sans o San Francisco), tracking negativo sutil (`tracking-tight`).
* **Números y Métricas:** Obligatoriamente `tabular-nums font-semibold`.
* **Jerarquía Valor vs Unidad:** El valor numérico se presenta en `text-lg` o `text-2xl font-bold`, mientras la unidad (`kg`, `reps`) va en `text-xs text-zinc-500 font-medium`.

---

## 3. Especificación de las 5 Pantallas Clave

```text
┌────────────────────────────────────────────────────────┐
│                   BARRA DE ESTADO                      │
├────────────────────────────────────────────────────────┤
│                                                        │
│   [ HOME ]  [ WORKOUT ]  [ STATS ]  [ PLAN ]  [ LIB ]  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

### A. Home (Dashboard Principal)

**Propósito:** Proporcionar acceso instantáneo al entrenamiento del día y resumen de recuperación sin navegación superflua.

* **Encabezado:** Saludo personalizado, racha activa (*streak* en días consecutivos/semanales) y fecha actual.
* **Tarjeta de Acción Rápida (Hero Card):**
  * Rutina sugerida para hoy (ej. *"Torso - Fuerza e Hipertrofia"*).
  * Lista rápida de los primeros 3 ejercicios previstos.
  * Botón primario de gran tamaño: **"Comenzar Entrenamiento"** (`h-14 bg-amber-500 text-black font-semibold active:scale-[0.98]`).
* **Resumen Semanal:**
  * Selector visual de 7 días (L M X J V S D) con indicadores de puntos o barras de estado (completado, descanso, programado).
* **Métricas Recientes:**
  * Volumen acumulado semanal (kg levantados).
  * Último récord personal (PR) alcanzado con badge destacado.

---

### B. Workout (Entrenamiento en Vivo & Registro)

**Propósito:** Interfaz de combate durante la sesión física. Cero fricción para cargar peso y repeticiones mientras se entrena.

* **Top Bar Fija:**
  * Nombre de la rutina actual y cronómetro global de sesión (`tabular-nums`).
  * Botón de menú secundario / Cancelar / Finalizar sesión.
* **Carrusel o Lista Vertical de Ejercicios:**
  * Tarjeta de ejercicio con ilustración/badge del grupo muscular principal y notas técnicas previas.
  * Historial inmediato: Muestra sutilmente lo levantado en la sesión anterior (ej. *"Anterior: 80 kg × 8"*).
* **Tabla de Series (Set Row Component):**
  * Columnas: `SET` (1, 2, 3) | `ANTERIOR` | `PESO (KG)` | `REPS` | `CHECK (✓)`.
  * Inputs con `inputMode="decimal"` y botones de ajuste rápido (`+2.5`, `-2.5`).
  * Botón de **Check de Serie**: Cuadrado de 50×50 px. Al pulsarse:
    * Se colorea en `emerald-500` con micro-resorte (`scale: 1.08 -> 1.0`).
    * Dispara automáticamente el **Temporizador de Descanso**.
* **Temporizador de Descanso Flotante (Bottom Sticky Bar):**
  * Permanece visible sobre la navegación inferior con efecto cristal esmerilado (`backdrop-blur`).
  * Muestra cuenta regresiva circular o barra de progreso (`#38bdf8`), con botones rápidos: `+30s`, `-15s`, `Saltar`.
  * Al llegar a cero: vibración háptica corta y sonido tenue.

---

### C. Stats (Analítica & Progresión)

**Propósito:** Visualizar la sobrecarga progresiva y evaluar las ganancias de fuerza y volumen a lo largo del tiempo.

* **Selector de Métricas:** Tabs horizontales: `Estimación 1RM` | `Volumen` | `Frecuencia Muscular`.
* **Gráfica de Progresión 1RM:**
  * Curva limpia en gradiente esmeralda/ámbar sobre fondo negro.
  * Línea de tendencia basada en los cálculos puros del paquete de dominio (fórmulas Epley y Brzycki).
  * Puntos clave destacando hitos (ej. *"Nuevo 1RM: 105 kg en Press Banca"*).
* **Distribución de Volumen por Grupo Muscular:**
  * Desglose de series efectivas semanales por grupo (Pecho, Espalda, Piernas, Hombros, etc.) comparadas con el umbral óptimo (ej. 12-20 series).
* **Récords Personales (PR Hall):**
  * Tarjetas de trofeo compactas para los levantamientos principales (Sentadilla, Banca, Peso Muerto, Militar).

---

### D. Plan (Gestor de Rutinas & Progresión)

**Propósito:** Configurar la estructura de días, asignación de ejercicios y reglas de sobrecarga.

* **Mis Rutinas:**
  * Vista de tarjetas organizadas por división (ej. *Push / Pull / Legs*, *Torso / Pierna*, *Full Body*).
  * Indicador de frecuencia recomendada (ej. *"4 días por semana"*).
* **Editor de Rutina / Día:**
  * Reordenamiento drag-and-drop de ejercicios.
  * Configuración de objetivos por ejercicio:
    * Rango de repeticiones objetivo (ej. `6 - 8 reps`).
    * Número de series y tipo (Calentamiento, Efectiva, Drop-set, Al fallo).
    * Regla de progresión doble configurada (subir carga cuando se alcancen todas las series en el límite superior).

---

### E. Library (Biblioteca de Ejercicios)

**Propósito:** Catálogo categorizado y enciclopedia de ejercicios con búsqueda instantánea.

* **Barra de Búsqueda & Filtros Rápidos:**
  * Buscador en tiempo real con debounce.
  * Chips horizontales de filtrado por grupo muscular (Pectoral, Dorsal, Cuádriceps, etc.) y por equipamiento (Barra, Mancuernas, Polea, Máquina, Peso corporal).
* **Elemento de Lista de Ejercicio:**
  * Nombre del ejercicio, músculos primarios y secundarios resaltados.
  * Último peso máximo registrado para ese ejercicio.
* **Detalle del Ejercicio (Sheet Modal):**
  * Instrucciones técnicas y consejos posturales.
  * Gráfica histórica individual de ese movimiento.
* **Acción de Creación:**
  * Botón para agregar ejercicios personalizados privados con selección de músculos primarios y secundarios.

---

## 4. Patrones de Navegación & Estructura Shell

### Barra de Navegación Inferior (Mobile Tab Bar)

* Altura: `h-16` (64px) con margen seguro inferior (`pb-safe`).
* Fondo: `#0C0C0E` con `backdrop-blur-lg` y borde superior `1px solid rgba(255, 255, 255, 0.08)`.
* Elementos:
  1. **Inicio** (`IconHome`)
  2. **Entrenar** (`IconFlame` o `IconBarbell`) — Botón central ligeramente destacado con acento ámbar.
  3. **Progreso** (`IconChartLine`)
  4. **Rutinas** (`IconCalendar` o `IconLayers`)
  5. **Biblioteca** (`IconBookOpen` o `IconDumbbell`)

---

## 5. Micro-interacciones y Animaciones Clave

| Interacción | Duración | Curva / Física | Efecto Visual |
| :--- | :--- | :--- | :--- |
| **Check de Serie** | 150ms | Spring (stiffness: 400, damping: 25) | El botón se escala levemente y cambia a verde esmeralda con icono animado |
| **Pulsación de Botón** | 100ms | Ease-out | `active:scale-[0.97]` dando sensación física táctil |
| **Aparición de Bottom Sheet** | 200ms | Spring amortiguado | Desplazamiento desde el borde inferior con arrastre hacia abajo para cerrar |
| **Alcanzar Récord (PR)** | 400ms | Elastic pop | Sutil resplandor perimetral dorado/esmeralda momentáneo |
| **Cuenta atrás del Timer** | 1000ms | Linear tick | Pulsación sutil en los últimos 3 segundos para alertar al usuario |

---

## 6. Accesibilidad y Estándar de Código

* **Contraste:** Todo texto relevante supera la relación 4.5:1 (WCAG AA) y 7:1 en métricas críticas (WCAG AAA).
* **Prefers Reduced Motion:** Si el usuario activa reducción de movimiento en su sistema operativo, todas las transiciones con resortes se transforman en fundidos rápidos de opacidad (`fade 100ms`).
* **Soporte PWA / Mobile:** Metatags `theme-color: #000000`, `viewport-fit=cover` para aprovechar el notch/Dynamic Island y evitar rebotes de scroll elástico no deseados fuera del contenedor principal.
