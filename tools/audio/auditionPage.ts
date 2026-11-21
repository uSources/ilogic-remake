/**
 * La pagina para oir los candidatos y elegir (tools/audio/out/index.html): por sonido, su texto, un
 * reproductor por candidato y la orden para pasar los buenos al juego. Se abre tal cual en el navegador.
 */
import type { Candidate } from './candidates';
import type { SoundSpec } from './catalog';
import { isEffect, KINDS } from './soundKinds';

export interface AuditionSection {
  readonly spec: SoundSpec;
  readonly candidates: readonly Candidate[];
}

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (character) => ESCAPES[character] ?? character);

function candidateHtml(id: string, candidate: Candidate): string {
  return `<figure><figcaption><b>${candidate.number}</b> · ${candidate.seconds.toFixed(2)} s</figcaption><audio controls preload="none" src="${id}/${candidate.number}.wav"></audio></figure>`;
}

/** Cuantos se eligen: los efectos y las voces, tantos como variantes; el resto, uno. */
const howManyToPick = (spec: SoundSpec): number => (isEffect(spec) ? (spec.variants ?? 1) : 1);

function sectionHtml({ spec, candidates }: AuditionSection): string {
  const prompt = candidates.at(-1)?.prompt ?? spec.prompt;
  return `<section id="${spec.id}">
<h2>${spec.id} <small>${spec.kind} · ${spec.seconds} s · elegir ${howManyToPick(spec)} · public/assets/${KINDS[spec.kind].folder}/</small></h2>
<p class="prompt">${escapeHtml(prompt)}</p>
<div class="candidates">${candidates.map((candidate) => candidateHtml(spec.id, candidate)).join('\n')}</div>
<code>npm run sonidos -- elegir ${spec.id} 1${howManyToPick(spec) > 1 ? ',2,...' : ''}</code>
</section>`;
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f6f4ef; --fg: #222; --card: #fff; --muted: #777; }
@media (prefers-color-scheme: dark) { :root { --bg: #1b1b1d; --fg: #eee; --card: #26262a; --muted: #999; } }
body { background: var(--bg); color: var(--fg); font: 15px/1.4 system-ui, sans-serif; margin: 0 auto; padding: 16px; max-width: 1100px; }
nav a { margin-right: 10px; }
section { background: var(--card); border-radius: 10px; padding: 12px 16px; margin: 16px 0; }
h2 { margin: 0; font-size: 18px; } small { color: var(--muted); font-weight: normal; }
.prompt { color: var(--muted); margin: 4px 0 10px; }
.candidates { display: flex; flex-wrap: wrap; gap: 10px; }
figure { margin: 0; } figcaption { font-size: 13px; } audio { width: 250px; }
code { display: block; margin-top: 10px; user-select: all; }
#warning { background: #c0392b; color: #fff; padding: 10px 14px; border-radius: 8px; }
#warning code { display: inline; margin: 0; }`;

/**
 * Abierta como fichero (doble clic, o desde la app de Claude) los audios no cargan y no suena nada. El
 * aviso se ve de entrada y solo lo quita el script cuando la sirve un servidor; si alli falla un audio,
 * vuelve. Asi sale tambien donde los scripts no corren.
 */
const WARNING = `<p id="warning">Asi no suenan: abre esta pagina con <code>npm run sonidos -- escuchar</code>, o oyelos en la terminal con <code>npm run sonidos -- oir &lt;sonido&gt;</code>.</p>
<script>
const warning = document.getElementById('warning');
warning.hidden = location.protocol.startsWith('http');
document.addEventListener('error', (event) => { if (event.target instanceof HTMLAudioElement) warning.hidden = false; }, true);
</script>`;

export function auditionPage(sections: readonly AuditionSection[]): string {
  const index = sections.map(({ spec }) => `<a href="#${spec.id}">${spec.id}</a>`).join(' ');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sonidos de Ilogic</title><style>${STYLE}</style></head>
<body><h1>Candidatos</h1>${WARNING}<p>Escucha y pasa los buenos al juego con la orden de cada sonido.</p>
<nav>${index}</nav>
${sections.map(sectionHtml).join('\n')}
</body></html>
`;
}
