// Pesos de ai.json al guardar la IA de referencia (2026-11-05). No editar, salvo para adaptarla a un cambio del nucleo (docs/ARQUITECTURA.md, IA).
const AI = {"MAXMERGELIFE":130,"MAXCAPTDIST":8,"LIFETOBACK":40,"COSTSCALE":1000,"KILLBONUS":50,"HQDEFENDER":200,"STOPCAPTUREHQ":400,"STOPCAPTURE":60,"BONUSDAMAGE":50,"CAPTUREHQ":12,"CAPTUREOWNED":4,"MINCAPTURERS":4,"GENERALMINVALUE":3000,"REVEALVALUE":500,"GUARDRADIUS":4,"CONTROLPOINT":6,"FOCUSFIRE":100,"SQUADSPREAD":2} as const;
/** La IA de referencia juega con estos pesos, sea cual sea el contenido de la partida. */
export const weightsOf = (_s: unknown): typeof AI => AI;
