/* ============================================================
   sw.js — service worker.
   Precarga todos los recursos en la instalación: tras la primera
   visita la app funciona completa y sin red.
   Sube VERSION cada vez que cambies cualquier archivo.
   ============================================================ */
'use strict';

const VERSION = 'v3.1.0';
const CACHE = 'carrera-vueltas-' + VERSION;

const RECURSOS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/util.js',
  './js/ui.js',
  './js/excel.js',
  './js/db.js',
  './js/estado.js',
  './js/nfc.js',
  './js/exportar.js',
  './js/carrera.js',
  './js/inscripcion.js',
  './js/posiciones.js',
  './js/tandas.js',
  './js/ajustes.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache.addAll falla entero si un recurso falla: los pedimos uno a uno
    // para que un archivo perdido no deje la app sin modo sin conexión.
    await Promise.all(RECURSOS.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch (_) { /* se reintentará en la primera petición real */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.map(n => n.startsWith('carrera-vueltas-') && n !== CACHE
      ? caches.delete(n) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: siempre servimos el index cacheado si no hay red.
  if (req.mode === 'navigate') {
    ev.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', res.clone());
        return res;
      } catch (_) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('Sin conexión y sin copia local.', {
                 status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
               });
      }
    })());
    return;
  }

  // Resto: primero la caché (offline-first), y refresco silencioso de fondo.
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(req);
    if (guardado) {
      ev.waitUntil((async () => {
        try {
          const fresco = await fetch(req);
          if (fresco.ok) await cache.put(req, fresco);
        } catch (_) { /* sin red: seguimos con la copia */ }
      })());
      return guardado;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (_) {
      return new Response('Recurso no disponible sin conexión.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

self.addEventListener('message', ev => {
  if (ev.data === 'actualizar') self.skipWaiting();
});
