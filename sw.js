// Service worker de la PWA: deja instalar el juego y jugarlo sin conexion.
//
// "vite build" (plugin ilogic-pwa de vite.config.ts) cambia la linea de BUILD por la version real:
// un hash del contenido y la lista de ficheros a guardar al instalar. Cada publicacion trae un
// service worker distinto, asi que el navegador lo instala, guarda los ficheros nuevos y borra
// los de la version anterior. En "npm run dev" no se registra (src/pwa.ts).
//
// - Ficheros con hash en el nombre (assets/index-AbC123xy.js): nunca cambian → primero la cache.
// - Todo lo demas (index.html, atlas, musica, iconos): primero la red, y la cache si no hay
//   conexion. Asi una version nueva nunca mezcla su codigo con graficos viejos.
// - Peticiones a otros sitios (notas de parche de GitHub) y a las previews de las PR
//   (preview/<hash>/, que tienen su propio service worker) no se tocan.
const BUILD = {"version":"1b91912b7807","precache":["./","assets/ambient/amb_desert.mp3","assets/ambient/amb_desert.ogg","assets/ambient/amb_dunes.mp3","assets/ambient/amb_dunes.ogg","assets/ambient/amb_factory.mp3","assets/ambient/amb_factory.ogg","assets/ambient/amb_forest.mp3","assets/ambient/amb_forest.ogg","assets/ambient/amb_marsh.mp3","assets/ambient/amb_marsh.ogg","assets/ambient/amb_meadow.mp3","assets/ambient/amb_meadow.ogg","assets/ambient/amb_oil_pump.mp3","assets/ambient/amb_oil_pump.ogg","assets/ambient/amb_peaks.mp3","assets/ambient/amb_peaks.ogg","assets/ambient/amb_plains.mp3","assets/ambient/amb_plains.ogg","assets/ambient/amb_rain.mp3","assets/ambient/amb_rain.ogg","assets/ambient/amb_sandstorm.mp3","assets/ambient/amb_sandstorm.ogg","assets/ambient/amb_sea.mp3","assets/ambient/amb_sea.ogg","assets/ambient/amb_snowfall.mp3","assets/ambient/amb_snowfall.ogg","assets/ambient/amb_snowfield.mp3","assets/ambient/amb_snowfield.ogg","assets/ambient/amb_snowy.mp3","assets/ambient/amb_snowy.ogg","assets/ambient/amb_storm.mp3","assets/ambient/amb_storm.ogg","assets/ambient/amb_swamp.mp3","assets/ambient/amb_swamp.ogg","assets/ambient/amb_woods.mp3","assets/ambient/amb_woods.ogg","assets/atlas/atlas-0.json","assets/atlas/atlas-0.png","assets/atlas/atlas-1.json","assets/atlas/atlas-1.png","assets/fredoka-DM6njrJ3.woff2","assets/ilogic-CbWqDDSn.woff2","assets/img/raton.png","assets/img/raton_boton.png","assets/main-BD_wdPa4.css","assets/main-BnmBBhM1.js","assets/models/buildings/airport_blue.glb","assets/models/buildings/airport_neutral.glb","assets/models/buildings/airport_red.glb","assets/models/buildings/base_blue.glb","assets/models/buildings/base_neutral.glb","assets/models/buildings/base_red.glb","assets/models/buildings/city_blue.glb","assets/models/buildings/city_neutral.glb","assets/models/buildings/city_red.glb","assets/models/buildings/factory_blue.glb","assets/models/buildings/factory_neutral.glb","assets/models/buildings/factory_red.glb","assets/models/buildings/oil_blue.glb","assets/models/buildings/oil_neutral.glb","assets/models/buildings/oil_red.glb","assets/models/buildings/stronghold_blue.glb","assets/models/buildings/stronghold_neutral.glb","assets/models/buildings/stronghold_red.glb","assets/models/terrain/cactus.glb","assets/models/terrain/cattails.glb","assets/models/terrain/flowers_mixed.glb","assets/models/terrain/flowers_purple.glb","assets/models/terrain/flowers_red.glb","assets/models/terrain/flowers_yellow.glb","assets/models/terrain/frog.glb","assets/models/terrain/lilies_0.glb","assets/models/terrain/lilies_1.glb","assets/models/terrain/lilies_2.glb","assets/models/terrain/pines.glb","assets/models/terrain/reeds.glb","assets/models/terrain/snowman.glb","assets/models/terrain/swamp_trees_0.glb","assets/models/terrain/swamp_trees_1.glb","assets/models/terrain/tile_bog_0.glb","assets/models/terrain/tile_bog_1.glb","assets/models/terrain/tile_bog_2.glb","assets/models/terrain/tile_deep.glb","assets/models/terrain/tile_forest_0.glb","assets/models/terrain/tile_forest_1.glb","assets/models/terrain/tile_forest_2.glb","assets/models/terrain/tile_grass_0.glb","assets/models/terrain/tile_grass_1.glb","assets/models/terrain/tile_grass_2.glb","assets/models/terrain/tile_grass_3.glb","assets/models/terrain/tile_ice.glb","assets/models/terrain/tile_marsh_0.glb","assets/models/terrain/tile_marsh_1.glb","assets/models/terrain/tile_marsh_2.glb","assets/models/terrain/tile_shallow.glb","assets/models/terrain/tile_snow_0.glb","assets/models/terrain/tile_snow_1.glb","assets/models/terrain/tile_snow_2.glb","assets/models/terrain/tile_swamp_deep.glb","assets/models/terrain/tile_swamp_shallow.glb","assets/models/terrain/tile_swamp_water.glb","assets/models/terrain/tile_water.glb","assets/models/terrain/trees.glb","assets/models/units/antiair_blue.glb","assets/models/units/antiair_red.glb","assets/models/units/artillery_blue.glb","assets/models/units/artillery_red.glb","assets/models/units/blocker_blue.glb","assets/models/units/blocker_red.glb","assets/models/units/bomber_blue.glb","assets/models/units/bomber_red.glb","assets/models/units/bsoldier_blue.glb","assets/models/units/bsoldier_red.glb","assets/models/units/car_blue.glb","assets/models/units/car_red.glb","assets/models/units/fighter_blue.glb","assets/models/units/fighter_red.glb","assets/models/units/fsoldier_blue.glb","assets/models/units/fsoldier_red.glb","assets/models/units/lfighter_blue.glb","assets/models/units/lfighter_red.glb","assets/models/units/ltank_blue.glb","assets/models/units/ltank_red.glb","assets/models/units/missile_truck_blue.glb","assets/models/units/missile_truck_red.glb","assets/models/units/msoldier_blue.glb","assets/models/units/msoldier_red.glb","assets/models/units/soldier_blue.glb","assets/models/units/soldier_red.glb","assets/models/units/ssoldier_blue.glb","assets/models/units/ssoldier_red.glb","assets/models/units/supplier_blue.glb","assets/models/units/supplier_red.glb","assets/models/units/tank_blue.glb","assets/models/units/tank_red.glb","assets/models/units/thelicopter_blue.glb","assets/models/units/thelicopter_red.glb","assets/models/units/transport_blue.glb","assets/models/units/transport_red.glb","assets/models/units/wtank_blue.glb","assets/models/units/wtank_red.glb","assets/models3d-BJLOMyx4.js","assets/nunito-BzFMHfZw.woff2","assets/pixelify-sans-latin-400-normal-DLrIX9QE.woff2","assets/sfx/capture_1.wav","assets/sfx/capture_done_1.wav","assets/sfx/defeat_1.wav","assets/sfx/explosion_1.wav","assets/sfx/explosion_2.wav","assets/sfx/explosion_3.wav","assets/sfx/hit_1.wav","assets/sfx/hit_2.wav","assets/sfx/hit_3.wav","assets/sfx/shot_artillery_1.wav","assets/sfx/shot_artillery_2.wav","assets/sfx/shot_artillery_3.wav","assets/sfx/shot_bazooka_1.wav","assets/sfx/shot_bazooka_2.wav","assets/sfx/shot_bazooka_3.wav","assets/sfx/shot_bomb_1.wav","assets/sfx/shot_cannon_1.wav","assets/sfx/shot_cannon_2.wav","assets/sfx/shot_cannon_3.wav","assets/sfx/shot_cannon_heavy_1.wav","assets/sfx/shot_cannon_heavy_2.wav","assets/sfx/shot_cannon_heavy_3.wav","assets/sfx/shot_cannon_heavy_4.wav","assets/sfx/shot_flak_1.wav","assets/sfx/shot_flak_2.wav","assets/sfx/shot_flak_3.wav","assets/sfx/shot_machinegun_1.wav","assets/sfx/shot_machinegun_2.wav","assets/sfx/shot_machinegun_3.wav","assets/sfx/shot_machinegun_4.wav","assets/sfx/shot_missile_1.wav","assets/sfx/shot_missile_2.wav","assets/sfx/shot_missile_3.wav","assets/sfx/shot_missile_launch_1.wav","assets/sfx/shot_missile_launch_2.wav","assets/sfx/shot_mortar_1.wav","assets/sfx/shot_mortar_2.wav","assets/sfx/shot_mortar_3.wav","assets/sfx/shot_pistol_1.wav","assets/sfx/shot_pistol_2.wav","assets/sfx/shot_rifle_1.wav","assets/sfx/shot_rifle_2.wav","assets/sfx/shot_rifle_3.wav","assets/sfx/spawn_1.wav","assets/sfx/step_drive_1.wav","assets/sfx/step_drive_2.wav","assets/sfx/step_drive_3.wav","assets/sfx/step_fly_1.wav","assets/sfx/step_fly_2.wav","assets/sfx/step_fly_3.wav","assets/sfx/step_march_1.wav","assets/sfx/step_march_2.wav","assets/sfx/step_march_3.wav","assets/sfx/step_march_4.wav","assets/sfx/step_tracks_1.wav","assets/sfx/step_tracks_2.wav","assets/sfx/step_tracks_3.wav","assets/sfx/step_tracks_4.wav","assets/sfx/turn_start_1.wav","assets/sfx/ui_back_1.wav","assets/sfx/ui_move_1.wav","assets/sfx/ui_select_1.wav","assets/sfx/unit_select_1.wav","assets/sfx/unit_select_2.wav","assets/sfx/unit_select_3.wav","assets/sfx/victory_1.wav","assets/sfx/voice_ack_driver_1.wav","assets/sfx/voice_ack_driver_2.wav","assets/sfx/voice_ack_driver_3.wav","assets/sfx/voice_ack_driver_4.wav","assets/sfx/voice_ack_infantry_1.wav","assets/sfx/voice_ack_infantry_2.wav","assets/sfx/voice_ack_infantry_3.wav","assets/sfx/voice_ack_infantry_4.wav","assets/sfx/voice_ack_pilot_1.wav","assets/sfx/voice_ack_pilot_2.wav","assets/sfx/voice_ack_pilot_3.wav","assets/sfx/voice_ack_pilot_4.wav","assets/sfx/voice_attack_1.wav","assets/sfx/voice_attack_2.wav","assets/sfx/voice_attack_3.wav","assets/sfx/voice_attack_4.wav","assets/sfx/voice_cheer_1.wav","assets/sfx/voice_cheer_2.wav","assets/sfx/voice_cheer_3.wav","assets/sfx/voice_cheer_4.wav","assets/sfx/voice_down_1.wav","assets/sfx/voice_down_2.wav","assets/sfx/voice_down_3.wav","assets/sfx/voice_down_4.wav","assets/sfx/voice_hurt_1.wav","assets/sfx/voice_hurt_2.wav","assets/sfx/voice_hurt_3.wav","assets/sfx/voice_hurt_4.wav","assets/silkscreen-latin-400-normal-CtPo2yA5.woff2","assets/unitPiece-CvHgzE5k.css","assets/unitPiece-R-8mNG8N.js","icons/apple-touch-icon.png","icons/favicon-32.png","icons/favicon-64.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-192.png","icons/maskable-512.png","index.html","manifest.webmanifest","units3d.html"]};

const PREFIX = 'ilogic-';
const CACHE = PREFIX + BUILD.version;
const IMMUTABLE = /\/assets\/[^/]+-[\w-]{8}\.\w+$/;
const scope = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(BUILD.precache.map((p) => new URL(p, scope).href)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = req.url.split('#')[0];
  if (!url.startsWith(scope) || url.slice(scope.length).startsWith('preview/')) return;

  if (req.mode === 'navigate') event.respondWith(networkFirst(req, new URL('index.html', scope).href));
  else if (IMMUTABLE.test(new URL(url).pathname)) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(fallback ?? req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req, { ignoreSearch: true })) ?? (fallback && (await cache.match(fallback)));
    if (hit) return hit;
    throw err;
  }
}
