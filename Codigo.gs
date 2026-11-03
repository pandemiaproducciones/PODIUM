/* =====================================================================
   PÓDIUM · FINAL DEPARTAMENTAL — "Cerebro" (Google Apps Script)
   ---------------------------------------------------------------------
   Este código vive en Google (Extensiones > Apps Script) y es el que
   lee y escribe en la hoja de cálculo. La página web (index.html) le
   hace preguntas y él responde.

   NO necesitas entender todo. Lo único que podrías querer cambiar está
   en la hoja "final_config" (precio, costo por modificar, abrir/cerrar).
   ===================================================================== */

// ID de tu hoja de cálculo (es la parte larga del enlace de Google Sheets)
const ID_HOJA = '1urjg2JEbEW2SGD653coE2cpAYEeSE9XysXe1aKjclEs';

// Nombres de las pestañas que usa esta versión
const HOJAS = {
  usuarios:   'usuarios',          // ya existe: usuario | pass | nombre | estado
  bandas:     'final_bandas',      // las 12 agrupaciones
  apuestas:   'final_apuestas',    // aquí se guardan las apuestas (no editar a mano)
  config:     'final_config',      // precios y si las apuestas están abiertas
  resultados: 'final_resultados'   // el ranking oficial, cuando se conozca
};

// Valores por defecto (se usan si falta algo en "final_config")
const POR_DEFECTO = {
  estado: 'ABIERTA',
  apuesta_inicial: 20000,
  costo_modificacion: 1000,
  max_modificaciones: 2,
  mostrar_resultados: 'NO',
  puestos_premiados: 5,   // gana quien acierte exactamente estos primeros puestos
  comision_app: 0.10      // parte del pozo que se queda la app si hay ganadores
};

const COLUMNAS_FIJAS = ['fecha_creacion', 'ultima_modificacion', 'usuario', 'nombre', 'modificaciones', 'valor'];


/* ---------------------------------------------------------------------
   1) EJECUTA ESTA FUNCIÓN UNA SOLA VEZ (botón ▶ Ejecutar en el editor).
      Crea las pestañas nuevas sin tocar las que ya tienes.
   --------------------------------------------------------------------- */
function prepararHoja() {
  const ss = libro_();

  crearSiNoExiste_(ss, HOJAS.bandas, [['nombre']].concat(
    Array.from({ length: 12 }, (_, i) => ['ESCRIBE AQUÍ LA BANDA ' + (i + 1)])
  ));

  crearSiNoExiste_(ss, HOJAS.config, [
    ['clave', 'valor', 'para qué sirve'],
    ['estado', 'ABIERTA', 'ABIERTA = se puede apostar. CERRADA = nadie puede apostar ni modificar.'],
    ['apuesta_inicial', 20000, 'Valor con el que empieza cada apuesta.'],
    ['costo_modificacion', 1000, 'Lo que se descuenta cada vez que alguien modifica.'],
    ['max_modificaciones', 2, 'Cuántas veces puede modificar cada persona.'],
    ['mostrar_resultados', 'NO', 'Pon SI cuando ya llenaste final_resultados y quieres que todos lo vean.'],
    ['puestos_premiados', 5, 'Gana quien acierte exactamente estos primeros puestos, en orden.'],
    ['comision_app', 0.1, 'Parte del pozo que se queda la app cuando hay ganadores. Si nadie gana, la app se queda con todo.']
  ]);

  const encabezadoApuestas = COLUMNAS_FIJAS.concat(
    Array.from({ length: 12 }, (_, i) => 'puesto_' + (i + 1))
  );
  crearSiNoExiste_(ss, HOJAS.apuestas, [encabezadoApuestas]);

  crearSiNoExiste_(ss, HOJAS.resultados, [['puesto', 'banda']].concat(
    Array.from({ length: 12 }, (_, i) => [i + 1, ''])
  ));

  Logger.log('Listo. Revisa las pestañas nuevas en tu hoja de cálculo.');
}


/* ---------------------------------------------------------------------
   2) Puertas de entrada: la página web llama aquí.
   --------------------------------------------------------------------- */
function doGet() {
  return json_({ ok: true, mensaje: 'El cerebro de Pódium está funcionando.' });
}

function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (p.accion === 'datos')   return json_(datos_(p));
    if (p.accion === 'guardar') return json_(guardar_(p));
    return json_({ ok: false, error: 'Acción desconocida.' });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}


/* ---------------------------------------------------------------------
   3) Lógica
   --------------------------------------------------------------------- */

// Devuelve todo lo que la página necesita mostrar
function datos_(p) {
  const yo = verificar_(p.user, p.pass);
  const cfg = config_();
  const bandas = bandas_();
  const apuestas = apuestas_();

  const mia = apuestas.lista.find(a => a.usuarioClave === yo.clave) || null;
  const pozo = apuestas.lista.reduce((s, a) => s + a.valor, 0);

  let resultados = null;
  if (cfg.mostrarResultados) {
    const oficial = resultadosOficiales_();
    // Para cada persona: qué puestos acertó (true/false). La página decide quién gana.
    const tabla = apuestas.lista.map(a => ({
      nombre: a.nombre || a.usuario,
      puestos: oficial.map((b, i) => a.ranking[i] === b),
      esTuyo: a.usuarioClave === yo.clave
    }));
    resultados = { oficial: oficial, tabla: tabla };
  }

  return {
    ok: true,
    usuario: { nombre: yo.nombre },
    config: {
      abierta: cfg.abierta,
      apuestaInicial: cfg.apuestaInicial,
      costoModificacion: cfg.costoModificacion,
      maxModificaciones: cfg.maxModificaciones,
      puestosPremiados: cfg.puestosPremiados,
      comision: cfg.comision
    },
    bandas: bandas,
    miApuesta: mia ? { ranking: mia.ranking, modificaciones: mia.modificaciones, valor: mia.valor } : null,
    pozo: pozo,
    apostadores: apuestas.lista.length,
    resultados: resultados
  };
}

// Crea o modifica la apuesta del usuario
function guardar_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // evita que dos personas escriban al mismo tiempo
  try {
    const yo = verificar_(p.user, p.pass);
    const cfg = config_();
    if (!cfg.abierta) throw new Error('Las apuestas están cerradas.');

    const bandas = bandas_();
    const ranking = (p.ranking || []).map(x => String(x || '').trim());
    validarRanking_(ranking, bandas);

    const hoja = libro_().getSheetByName(HOJAS.apuestas);
    const apuestas = apuestas_();
    const mia = apuestas.lista.find(a => a.usuarioClave === yo.clave);
    const ahora = new Date();

    if (!mia) {
      hoja.appendRow([ahora, ahora, yo.usuario, yo.nombre, 0, cfg.apuestaInicial].concat(ranking));
    } else {
      if (mia.modificaciones >= cfg.maxModificaciones) {
        throw new Error('Ya usaste tus ' + cfg.maxModificaciones + ' modificaciones.');
      }
      if (mia.ranking.join('|') === ranking.join('|')) {
        throw new Error('Tu ranking es igual al que ya tenías. No se descontó nada.');
      }
      const mods = mia.modificaciones + 1;
      const valor = cfg.apuestaInicial - mods * cfg.costoModificacion;
      const fila = [mia.fechaCreacion, ahora, yo.usuario, yo.nombre, mods, valor].concat(ranking);
      hoja.getRange(mia.fila, 1, 1, fila.length).setValues([fila]);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return datos_(p);
}


/* ---------------------------------------------------------------------
   4) Ayudantes (lectura de la hoja)
   --------------------------------------------------------------------- */
function libro_() { return SpreadsheetApp.openById(ID_HOJA); }

function hoja_(nombre) {
  const h = libro_().getSheetByName(nombre);
  if (!h) throw new Error('Falta la pestaña "' + nombre + '". Ejecuta prepararHoja() en Apps Script.');
  return h;
}

function clave_(texto) { return String(texto || '').trim().toLowerCase(); }

function verificar_(user, pass) {
  const u = clave_(user);
  const pw = String(pass || '').trim();
  if (!u || !pw) throw new Error('Escribe tu usuario y contraseña.');

  const valores = hoja_(HOJAS.usuarios).getDataRange().getValues();
  const enc = valores[0].map(clave_);
  const cU = enc.indexOf('usuario'), cP = enc.indexOf('pass'), cN = enc.indexOf('nombre'), cE = enc.indexOf('estado');
  if (cU < 0 || cP < 0) throw new Error('La pestaña "usuarios" debe tener las columnas usuario y pass.');

  for (let i = 1; i < valores.length; i++) {
    const fila = valores[i];
    if (clave_(fila[cU]) !== u) continue;
    if (String(fila[cP]).trim() !== pw) break;
    if (cE >= 0 && clave_(fila[cE]) === 'inactivo') {
      throw new Error('Tu usuario está inactivo. Habla con el administrador.');
    }
    const usuario = String(fila[cU]).trim();
    return { usuario: usuario, clave: u, nombre: (cN >= 0 && String(fila[cN]).trim()) || usuario };
  }
  throw new Error('Usuario o contraseña incorrectos.');
}

function config_() {
  const cfg = Object.assign({}, POR_DEFECTO);
  const h = libro_().getSheetByName(HOJAS.config);
  if (h) {
    h.getDataRange().getValues().slice(1).forEach(f => {
      const k = clave_(f[0]);
      if (k && f[1] !== '' && f[1] !== null) cfg[k] = f[1];
    });
  }
  const si = v => ['si', 'sí', 'true', 'verdadero'].indexOf(clave_(v)) >= 0;
  let comision = Number(String(cfg.comision_app).replace('%', '')) || 0;
  if (comision > 1) comision = comision / 100; // acepta 10 o 10% o 0.1
  return {
    puestosPremiados: Number(cfg.puestos_premiados) || 5,
    comision: comision,
    abierta: clave_(cfg.estado) === 'abierta',
    apuestaInicial: Number(cfg.apuesta_inicial) || 0,
    costoModificacion: Number(cfg.costo_modificacion) || 0,
    maxModificaciones: Number(cfg.max_modificaciones) || 0,
    mostrarResultados: si(cfg.mostrar_resultados)
  };
}

function bandas_() {
  const v = hoja_(HOJAS.bandas).getDataRange().getValues().slice(1);
  const lista = v.map(f => String(f[0] || '').trim()).filter(Boolean);
  if (lista.length < 2) throw new Error('El administrador aún no ha cargado las bandas.');
  return lista;
}

function apuestas_() {
  const valores = hoja_(HOJAS.apuestas).getDataRange().getValues();
  const n = COLUMNAS_FIJAS.length;
  const lista = [];
  for (let i = 1; i < valores.length; i++) {
    const f = valores[i];
    if (!String(f[2] || '').trim()) continue;
    lista.push({
      fila: i + 1,
      fechaCreacion: f[0],
      usuario: String(f[2]).trim(),
      usuarioClave: clave_(f[2]),
      nombre: String(f[3] || '').trim(),
      modificaciones: Number(f[4]) || 0,
      valor: Number(f[5]) || 0,
      ranking: f.slice(n).map(x => String(x || '').trim()).filter(Boolean)
    });
  }
  return { lista: lista };
}

function resultadosOficiales_() {
  const h = libro_().getSheetByName(HOJAS.resultados);
  if (!h) return [];
  return h.getDataRange().getValues().slice(1)
    .filter(f => String(f[1] || '').trim())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(f => String(f[1]).trim());
}

function validarRanking_(ranking, bandas) {
  if (ranking.length !== bandas.length) {
    throw new Error('Debes ubicar las ' + bandas.length + ' bandas.');
  }
  const vistas = {};
  ranking.forEach(b => {
    if (bandas.indexOf(b) < 0) throw new Error('La banda "' + b + '" no está en la lista oficial.');
    if (vistas[b]) throw new Error('La banda "' + b + '" está repetida.');
    vistas[b] = true;
  });
}

function crearSiNoExiste_(ss, nombre, filas) {
  if (ss.getSheetByName(nombre)) return;
  const h = ss.insertSheet(nombre);
  const ancho = Math.max.apply(null, filas.map(f => f.length));
  const datos = filas.map(f => f.concat(Array(ancho - f.length).fill('')));
  h.getRange(1, 1, datos.length, ancho).setValues(datos);
  h.getRange(1, 1, 1, ancho).setFontWeight('bold').setBackground('#fff3d6');
  h.setFrozenRows(1);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}