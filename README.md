# Pódium · Final Departamental

Página web para armar tu ranking de las 12 agrupaciones de la Final Departamental.
Es un proyecto pedagógico: los participantes los autoriza el administrador en una hoja de Google.

## Cómo funciona

- Cada usuario autorizado ordena las 12 bandas del puesto 1 al 12.
- La apuesta empieza en **$20.000**.
- Se puede modificar **2 veces**, y cada cambio descuenta **$1.000** (20.000 → 19.000 → 18.000).
- El **pozo** es la suma de todas las apuestas vigentes.
- **Gana quien acierte exactamente los 5 primeros puestos**, en orden.
- Los ganadores se reparten en partes iguales el **90 % del pozo**; la app se queda con el 10 %. Si nadie acierta, la app se queda con todo.
- Cuando el administrador publica los resultados, la app muestra los ganadores, cuánto gana cada uno y la tabla general.

## Partes del proyecto

| Archivo | Dónde vive | Qué hace |
|---|---|---|
| `index.html` | GitHub | La página que ven los usuarios |
| `Codigo.gs` | Google Apps Script | El "cerebro": lee y escribe en la hoja |
| Hoja de cálculo | Google Drive | Usuarios, bandas, apuestas y configuración |

## Pestañas de la hoja

- **usuarios**: `usuario | pass | nombre | estado` (estado `ACTIVO` o `INACTIVO`). Aquí se autoriza a la gente.
- **final_bandas**: los nombres de las 12 bandas, uno por fila.
- **final_config**: `estado` (ABIERTA/CERRADA), `apuesta_inicial`, `costo_modificacion`, `max_modificaciones`, `mostrar_resultados` (SI/NO), `puestos_premiados` (5), `comision_app` (10 %).
- **final_apuestas**: se llena sola. No editar a mano.
- **final_resultados**: el ranking oficial, cuando se conozca.

## Probar sin tocar la hoja

Agrega `?demo` al final de la dirección de la página (por ejemplo `https://usuario.github.io/repositorio/?demo`).
Usuario `demo`, contraseña `demo`.
