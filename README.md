# UMWELT · El Jardín de Frankenstein
**Experiencia Audiovisual Interactiva Multiusuario mediante Prótesis Táctil y Telemetría MQTT**  
*Taller de Diseño y Programación de Proyectos Interactivos (PPI)*  
Autora: Paula Frías

---

## 1. Concepto y Manifiesto Curatorial

### 1.1. Pregunta Guía y Marco Filosófico
> *“¿Qué ocurre cuando intentamos crear o proteger una forma de vida cuya percepción no podemos experimentar?”*

El biólogo y filósofo **Jakob von Uexküll** introdujo a comienzos del siglo XX la noción de ***Umwelt***: cada organismo habita una burbuja perceptual cerrada, moldeada exclusivamente por sus órganos sensoriales y sus necesidades biológicas vitales. Una abeja melífera no percibe el campo como un paisaje bucólico de verdes y rojos humanos; su visión tricromática se desplaza hacia el ultravioleta invisible, sus ojos compuestos leen la luz polarizada del cielo para triangular trayectorias solares, y los pelos de su cuerpo detectan diferencias de carga electrostática entre los pétalos y su tórax.

En esta obra, el teléfono móvil opera como una **prótesis de vuelo**. El interactor humano sostiene el dispositivo intentando acariciar, fecundar y hacer florecer un prado silvestre marchito. Sin embargo, ignora fundamentalmente las leyes y las escalas del mundo que pretende habitar. 

El gesto atraviesa inevitablemente una traducción técnica maquínica:
- El afecto humano se convierte en un vector de coordenadas cartesianas flotantes (`touch.x`, `touch.y`).
- La delicadeza se transforma en milibares de presión resistiva (`touch.f`) y diámetro de contacto (`touch.d`).
- El deseo de permanencia se decodifica en tasas de muestreo en hercios y paquetes binarios WebSocket.

La máquina **no comprende la intención de cuidar; solo computa señales**.

### 1.2. El Arquetipo de Frankenstein y la Autonomía Sintética
Al igual que en la advertencia de **Mary Shelley en *Frankenstein o el moderno Prometeo*** (1818), el afán humano de infundir vida a la materia inerte mediante el artificio técnico engendra una grieta ontológica irremediable:
1. **La Insistencia produce Asfixia:** Mientras más presiona o insiste el usuario sobre un mismo punto con su dedo intentando "nutrir" la flor, mayor es la acumulación de desfase matemático. El polen ya no fecunda con precisión, sino que se dispersa exponencialmente hacia la periferia en un vórtice turbulento. Si el contacto se vuelve opresivo, el sistema reacciona desencadenando una necrosis vegetal y una señal acústica de alarma (`alarma.wav`).
2. **La Prótesis se Mecaniza:** A medida que la interacción se prolonga en el tiempo, el zumbido orgánico de la abeja se entrelaza con una percusión metálica y rítmica (`maquina.mp3`), revelando que la colmena es, en realidad, un autómata industrial.
3. **La Metamorfosis Irreversible (Clímax):** Al alcanzarse el 80% de floración colectiva, el sistema entra en una fase de emancipación. Un popup curatorial anuncia que la vida sintética se ha independizado de la caricia humana. La imagen del prado comienza a ciclar de forma autónoma a través de tonos ultravioleta, cian y fucsia saturados, mientras el enjambre orbita sin atender a los dedos de los participantes. La criatura técnica ha escapado del control de su creador.

---

## 2. Funcionamiento Técnico y Arquitectura

### 2.1. Arquitectura del Sistema

```
  ┌────────────────────────────────────────────────────────┐
  │              TELÉFONOS PARTICIPANTES (iOS / Android)   │
  │   Sensor Touch API (X, Y, Diámetro, Presión, Dedos)    │
  │   DeviceOrientation API (Pitch, Roll, Giroscopio)      │
  │   Sin descargas: Corre en Safari / Chrome nativo       │
  └──────────────────────────┬─────────────────────────────┘
                             │ JSON binario / ~60 Hz
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │                 BROKER MQTT (Cloud / Local)            │
  │   b21edce6.ala.us-east-1.emqxsl.com (WSS Puerto 8084)  │
  │   Topología de Salas Dinámicas: tacto/<sala>/<dev>/... │
  └──────────────────────────┬─────────────────────────────┘
                             │ WebSocket Seguro
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │             ECOSISTEMA AUDIVISUAL (exp.html)           │
  │                                                        │
  │  [Motor 3D FPV Infinito]     [Web Audio API Engine]    │
  │  - Mosaico botánico 2048px   - Cadena de 8 nodos       │
  │  - Máscara orgánica radial   - BiquadFilter (Lowpass)  │
  │  - Enjambre 140 partículas   - StereoPanner + Dynamics │
  │  - Inmersión Umwelt (Macro)  - Analyser (Osciloscopio) │
  │                                                        │
  │  [Matriz de Traducción Interactiva (Gesto -> Salida)]  │
  └────────────────────────────────────────────────────────┘
```

### 2.2. Matriz de Traducción Sensible (Gesto Humano $\to$ Respuesta Audiovisual)

| Gesto Humano | Canal de Entrada (`tacto.js`) | Canal de Salida | Curva y Rango | Efecto Audiovisual y Función Poética |
|---|---|---|---|---|
| **Inclinación del teléfono** (Alabeo / Roll) | `ang.g` (Giroscopio Y) | `vuelo.inclinacion.x` | Lineal (-40° a +40°) | Inclinación de la perspectiva aérea 3D. El participante "vuela" sintiendo la desorientación del insecto. |
| **Inclinación del teléfono** (Cabeceo / Pitch) | `ang.b` (Giroscopio X) | `vuelo.inclinacion.y` | Suave (-25° a +25°) | Picada o elevación hacia el horizonte vegetal. |
| **Gesto de Pinza / 2 Dedos** (Pinch zoom) | `touch.dist` (Distancia entre dedos) | `vuelo.zoom` | Suave (0.7x a 2.6x) | **Inmersión Umwelt:** Desciende la cámara al nivel del suelo dentro del cáliz floral, desenfocando los pétalos en primer plano e intensificando el espectro ultravioleta. |
| **Amplitud táctil** | `touch.dist` | `flor.color_exotico` | Acelerada (0° a 260°) | Desplaza el espectro lumínico hacia la longitud de onda ultravioleta que percibe la abeja. |
| **Desplazamiento fluido** del dedo | Velocidad vectorial (`dPos/dt`) | `audio.abeja` | Proporcional (0 a 1) | Vuelo armónico y zumbido suave en resonancia mientras la caricia es continua y delicada. |
| **Rigidez / Fricción lenta** en un punto | Velocidad baja (`< 0.08`) | `audio.mala_abeja` | Rápida (0 a 1) | Estrés biológico: el insecto se siente atrapado o irritado por la torpeza del dedo humano. |
| **Contacto celular inicial** | `touch.down` (Contacto activo) | `audio.palpito` | Inmediato (0 a 1) | Latido basal orgánico; confirma el flujo de vida entre el cuerpo del usuario y el sustrato digital. |
| **Permanencia del contacto** (> 1.8 segundos) | Temporizador acumulado | `audio.maquina` | Rampa suave (0 a 0.85) | La colmena industrial despierta bajo la tierra: el pulso mecánico sobreescribe a la naturaleza. |
| **Presión excesiva / Apriete fuerte** | `touch.d` (> 78 px) o Clic Der. | `flor.necrosis` + `alarma` | Exponencial | Sobrecarga y asfixia: el prado se quema con manchas necróticas oscuras y dispara la sirena de rechazo. |
| **Gesto con 3 Dedos** (o Tecla 3) | `touch.n >= 3` | Disparo `audio.robot` | Pulso | Quiebre cibernético: colapso de la traducción donde la máquina expone su naturaleza algorítmica. |
| **Soltar la pantalla** (Levantar los dedos) | `touch.down == 0` | Disparo `audio.pago` | Disparo único | Fin abrupto de la caricia: sonido metálico de corte transaccional que disuelve el lazo sensible. |

### 2.3. Curaduría Acústica (8 Capas Sonoras en `audio_bee/`)

El diseño sonoro se compone de 8 capas cuidadosamente mezcladas en tiempo real mediante la **Web Audio API**:

1. **`bosque.flac` / `bosque.m4a`**  
   - *Rol:* Atmósfera vegetal basal constante. Susurro de follaje, brisa y fauna distante que sitúa el ecosistema en un estado de quietud antes de la intervención humana.
   - *Licencia:* Creative Commons 0 (Dominio Público).
2. **`abeja.wav` / `abeja.m4a`**  
   - *Rol:* Vuelo armónico natural. Zumbido en loop sintonizado con el desplazamiento suave y continuo sobre el prado.
   - *Licencia:* Creative Commons Attribution (Freesound / Soundly Library).
3. **`mala_abeja.mp3`**  
   - *Rol:* Agitación e irritación biológica. Frecuencias medias-altas ásperas que se activan ante movimientos titubeantes, rígidos o colectivos histéricos.
   - *Licencia:* CC BY-NC 3.0.
4. **`palpito.wav` / `palpito.m4a`**  
   - *Rol:* Latido celular primario. Pulso orgánico en bajas frecuencias que acompaña cada contacto físico en la pantalla.
   - *Licencia:* CC0.
5. **`maquina.mp3`**  
   - *Rol:* Pulso de la colmena artificial. Ritmo mecánico, seco y cíclico que emerge cuando el contacto se vuelve repetitivo y prolongado.
   - *Licencia:* CC BY 4.0.
6. **`alarma.wav`**  
   - *Rol:* Alerta de asfixia o necrosis. Frecuencia de corte estridente que irrumpe cuando el interactor ejerce demasiada fuerza o cuando se alcanza la masa crítica.
   - *Licencia:* CC0.
7. **`robot.mp3`**  
   - *Rol:* Falla de traducción y desborde numérico. Glitch sintético que subraya la imposibilidad de emular el cuerpo de la abeja con matemática digital.
   - *Licencia:* CC BY 3.0.
8. **`pago.mp3`**  
   - *Rol:* Quiebre transaccional al soltar el contacto. Campana metálica que evidencia la relación utilitaria entre el usuario y la plataforma.
   - *Licencia:* CC0.

---

## 3. Reflexión Crítica

### 3.1. Hallazgos sobre la Traducción Sensible
El desarrollo de *UMWELT* reveló que la interacción táctil en interfaces contemporáneas opera bajo un espejismo de intimidad. Solemos creer que deslizar el dedo sobre una pantalla de vidrio es un acto de contacto directo. Sin embargo, en el instante en que ese toque se conecta a una red telemática (MQTT) y a un motor de render, cada micro-gesto sufre una violencia ontológica: la caricia es trozada en enteros discretos de 8 bits y serializada a través de fibras ópticas.

La abeja de von Uexküll se orienta por gradientes de olor, polarización solar y vibraciones electrostáticas milimétricas. Intentar pilotar ese ser con un giroscopio MEMS de smartphone produce una disonancia deliberada: el interactor nunca logra ser abeja; solo logra constatar su propia condición de usuario atrapado en una prótesis técnica.

### 3.2. Límites y Fricciones del Medio Técnico
- **Latencia y Jitter de Red:** En redes inalámbricas públicas, la fluctuación del Ping (RTT entre 40 ms y 180 ms) genera un desfase perceptible entre el gesto y el vuelo del enjambre. Lejos de ser un defecto que deba ocultarse, este retraso se integró estéticamente a la obra como el **desfase de polen**, visibilizando la distancia física entre el cuerpo y el servidor.
- **Resolución Capacitiva:** Las pantallas móviles reconocen el toque como un óvalo aproximado (`touch.d`), sin sensibilidad real a la sutileza de la piel. Esa limitación se convirtió en el motor dramático de la **necrosis**: la pantalla confunde la búsqueda de cercanía con una opresión excesiva.

### 3.3. Proyecciones y Mejoras Futuras
1. **Retroalimentación Háptica Paramétrica (Vibration API Avanzada):**  
   Implementar microvibraciones diferenciadas en el teléfono del usuario según el estado de la colmena: un zumbido de frecuencia variable al volar, pulsos agudos en caso de irritación de la abeja (`mala_abeja`), y un "frenado" seco cuando ocurre necrosis o clímax. De este modo, la prótesis no solo extrae datos de la mano, sino que devuelve una textura táctil al cuerpo humano.
2. **Espacialización Sonora Multicanal (Ambisonics / Web Audio Panner 3D):**  
   Expandir el motor acústico hacia un sistema de audio inmersivo espacializado en 4 a 8 canales físicos en el espacio de exhibición. Cada participante conectado con su teléfono controlaría una fuente sonora tridimensional que viaja físicamente por las paredes de la sala según su vector de vuelo, transformando la galería en una colmena acústica compartida.

---

## 4. Instrucciones de Ejecución

### Opción A (Local con Python - No requiere Node.js)
Ideal para computadores sin `node` instalado:
```bash
# Situarse en la carpeta public
cd public

# Levantar servidor HTTP local
python3 -m http.server 8000
```
Abrir en el navegador: `http://localhost:8000/exp.html`

### Opción B (Servidor Completo con Node.js y Broker Interno)
```bash
npm install
node server.js
```
Abrir en el computador: `https://localhost:8443/exp`

### Conectar Teléfonos Polinizadores
1. Abrir la experiencia en el computador.
2. Desplegar el cajón **"1. Conectar Teléfonos (QR Colaborativo)"**.
3. Escanear el código QR con cualquier smartphone (iOS o Android) conectado a internet o a la misma red local.
4. Múltiples teléfonos pueden escanear el mismo código simultáneamente para sumarse como polinizadores en vivo.
