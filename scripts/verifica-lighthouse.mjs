import fs from 'node:fs';

const archivos = [
  ['MÓVIL', '/tmp/lighthouse-mobile.json'],
  ['ESCRITORIO', '/tmp/lighthouse-desktop.json'],
];
let fallo = false;

for (const [etiqueta, archivo] of archivos) {
  const r = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const c = r.categories;
  const puntuaciones = {
    rendimiento: Math.round(c.performance.score * 100),
    accesibilidad: Math.round(c.accessibility.score * 100),
    practicas: Math.round(c['best-practices'].score * 100),
    seo: Math.round(c.seo.score * 100),
  };
  console.log(`\n${etiqueta}:`, puntuaciones);
  console.log('LCP:', r.audits['largest-contentful-paint']?.displayValue);
  console.log('CLS:', r.audits['cumulative-layout-shift']?.displayValue);
  console.log('TBT:', r.audits['total-blocking-time']?.displayValue);

  if (puntuaciones.accesibilidad < 100 || puntuaciones.practicas < 100 || puntuaciones.seo < 100) fallo = true;
  if (puntuaciones.rendimiento < 95) fallo = true;
}

if (fallo) {
  console.error('\nAuditoría por debajo del estándar Atheron. Revisar los JSON adjuntos.');
  process.exit(1);
}
