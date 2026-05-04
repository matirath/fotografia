#!/usr/bin/env node

/**
 * Generador de IDs para trabajos de fotografía
 * Uso: node generar-trabajo.js [tipo] [cliente] [evento] [password]
 * 
 * Ejemplo:
 *   node generar-trabajo.js evento "Mutuo" "Inauguración" "mutuo-inag-26"
 *   node generar-trabajo.js marca "Delfina" "Quinceañera" "delfina-15-26"
 */

const fs = require('fs');
const path = require('path');

const REGISTRO_PATH = path.join(__dirname, 'trabajos-registro.json');
const AÑO_ACTUAL = new Date().getFullYear() % 100; // 26 para 2026

function loadRegistro() {
  if (!fs.existsSync(REGISTRO_PATH)) {
    return { trabajos: [] };
  }
  return JSON.parse(fs.readFileSync(REGISTRO_PATH, 'utf-8'));
}

function saveRegistro(data) {
  fs.writeFileSync(REGISTRO_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function generarProximoId(tipo, cliente) {
  const registro = loadRegistro();
  
  // Filtra trabajos del mismo tipo y cliente
  const trabajosSimilares = registro.trabajos.filter(t => 
    t.tipo === tipo && t.cliente === cliente && t.año === 2000 + AÑO_ACTUAL
  );
  
  // Secuencia siguiente
  const proximaSecuencia = trabajosSimilares.length + 1;
  const secuenciaStr = proximaSecuencia.toString().padStart(3, '0');
  
  return `${tipo}-${cliente.toLowerCase().replace(/\s+/g, '-')}-${AÑO_ACTUAL}-${secuenciaStr}`;
}

function crearTrabajo(tipo, cliente, evento, password, carpeta = null, titulo = null, subtitulo = null) {
  const registro = loadRegistro();
  
  const id = generarProximoId(tipo, cliente);
  const carpetaDefecto = carpeta || `${cliente.toLowerCase().replace(/\s+/g, '-')}/${evento.toLowerCase().replace(/\s+/g, '-')}`;
  const tituloDefecto = titulo || `Galería ${evento} - ${cliente}`;
  const subtituloDefecto = subtitulo || 'Selecciona tus fotos favoritas';
  
  const nuevoTrabajo = {
    id,
    tipo,
    cliente,
    evento,
    año: 2000 + AÑO_ACTUAL,
    secuencia: parseInt(id.split('-').pop()),
    password,
    carpeta: carpetaDefecto,
    titulo: tituloDefecto,
    subtitulo: subtituloDefecto,
    fecha_creacion: new Date().toISOString().split('T')[0],
    estado: 'activo',
    notas: ''
  };
  
  registro.trabajos.push(nuevoTrabajo);
  saveRegistro(registro);
  
  return nuevoTrabajo;
}

function listarTrabajos() {
  const registro = loadRegistro();
  
  console.log('\n📸 TRABAJOS REGISTRADOS\n');
  console.log('─'.repeat(120));
  console.log(
    'ID'.padEnd(30) + 
    'CLIENTE'.padEnd(15) + 
    'TIPO'.padEnd(10) + 
    'PASSWORD'.padEnd(20) + 
    'CARPETA'.padEnd(30) + 
    'ESTADO'.padEnd(10)
  );
  console.log('─'.repeat(120));
  
  registro.trabajos.forEach(t => {
    console.log(
      t.id.padEnd(30) + 
      t.cliente.padEnd(15) + 
      t.tipo.padEnd(10) + 
      t.password.padEnd(20) + 
      t.carpeta.padEnd(30) + 
      t.estado.padEnd(10)
    );
  });
  
  console.log('─'.repeat(120) + '\n');
}

function generarSQLInsert() {
  const registro = loadRegistro();
  
  console.log('\n📋 SQL INSERT PARA SUPABASE\n');
  console.log('Copia y pega esto en tu SQL Editor de Supabase:\n');
  console.log('─'.repeat(80));
  
  const inserts = registro.trabajos
    .filter(t => t.estado === 'activo')
    .map(t => `  ('${t.id}', '${t.password}', '${t.titulo}', '${t.subtitulo}', '${t.carpeta}')`)
    .join(',\n');
  
  const sql = `INSERT INTO claves (clave, password_plain, titulo, subtitulo, carpeta) VALUES
${inserts}
ON CONFLICT (clave) DO UPDATE SET 
  password_plain = EXCLUDED.password_plain,
  titulo = EXCLUDED.titulo,
  subtitulo = EXCLUDED.subtitulo,
  carpeta = EXCLUDED.carpeta;`;
  
  console.log(sql);
  console.log('─'.repeat(80) + '\n');
}

// CLI
const args = process.argv.slice(2);

if (args[0] === 'nueva') {
  // node generar-trabajo.js nueva evento "Mutuo" "Inauguración" "mutuo-inag-26"
  const tipo = args[1];
  const cliente = args[2];
  const evento = args[3];
  const password = args[4];
  
  if (!tipo || !cliente || !evento || !password) {
    console.error('❌ Falta información. Uso:');
    console.error('   node generar-trabajo.js nueva [tipo] [cliente] [evento] [password]');
    console.error('   Ejemplo:');
    console.error('   node generar-trabajo.js nueva evento "Mutuo" "Inauguración" "mutuo-inag-26"');
    process.exit(1);
  }
  
  const trabajo = crearTrabajo(tipo, cliente, evento, password);
  console.log('\n✅ Trabajo creado:\n');
  console.log(JSON.stringify(trabajo, null, 2));
  console.log('\n📁 Ahora crea la carpeta: imgs/' + trabajo.carpeta);
  console.log('📤 Sube las fotos ahí');
  console.log('🔐 Contraseña: ' + trabajo.password);
  
} else if (args[0] === 'listar') {
  listarTrabajos();
  
} else if (args[0] === 'sql') {
  generarSQLInsert();
  
} else {
  console.log('\n🎬 GENERADOR DE TRABAJOS - matirath.jpg\n');
  console.log('Comandos disponibles:\n');
  console.log('  node generar-trabajo.js nueva [tipo] [cliente] [evento] [password]');
  console.log('    Crea un nuevo trabajo con ID secuencial automático\n');
  console.log('  node generar-trabajo.js listar');
  console.log('    Muestra todos los trabajos registrados\n');
  console.log('  node generar-trabajo.js sql');
  console.log('    Genera el SQL INSERT para Supabase\n');
  console.log('EJEMPLOS:\n');
  console.log('  node generar-trabajo.js nueva evento "Mutuo" "Inauguración" "mutuo-inag-26"');
  console.log('  node generar-trabajo.js nueva marca "Delfina" "Quinceañera" "delfina-15-26"');
  console.log('  node generar-trabajo.js nueva evento "Bodas" "Ceremonia" "boda-2026"');
  console.log('');
}
