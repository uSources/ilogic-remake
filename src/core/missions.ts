/**
 * Misiones de la campaña. Son contenido (content/missions.json, en `content.missions`: el de la
 * partida, o `defaultContent()` fuera de una); aqui esta como se juega una y lo que se comprueba de
 * ella con el mapa entero.
 *
 * | Modulo | Que va |
 * |---|---|
 * | `missions/build` | la partida de una mision (`buildMission`), sus reglas (`missionSettings`) y buscarla (`missionById`) |
 * | `missions/check` | lo que se mira de una mision con su mapa (`checkMission`: para los tests y quien escribe una) |
 */
export { buildMission, missionById, missionSettings, terrainOf, type Mission } from './missions/build';
export { checkMission } from './missions/check';
