/**
 * Los grafos que se le mandan a ComfyUI, en su formato de API (el mismo que se puede arrastrar a la
 * ventana de ComfyUI para abrirlo a mano). Solo nodos que trae ComfyUI de serie.
 *
 * Generar es la plantilla de Stable Audio 3 de ComfyUI sin el paso que reescribe el texto con Qwen
 * (los textos ya van escritos en el catalogo): checkpoint + codificador t5gemma + KSampler.
 */

/** Un nodo: su clase y sus entradas (un valor, o `[id del nodo, salida]` para enlazar con otro). */
export interface GraphNode {
  readonly class_type: string;
  readonly inputs: Readonly<Record<string, unknown>>;
}

export type ComfyGraph = Readonly<Record<string, GraphNode>>;

/**
 * El modelo, en ComfyUI/models: checkpoints/ y text_encoders/ (docs/PLAN-SONIDO.md). El Small SFX no
 * vale: con ComfyUI 0.45.3 en Mac solo da ruido, con cualquier muestreador.
 */
export const STABLE_AUDIO_3 = { checkpoint: 'stable_audio_3_medium.safetensors', textEncoder: 't5gemma_b_b_ul2.safetensors' } as const;

/** Lo que usa la plantilla de ComfyUI: el modelo esta destilado para pocos pasos y sin guia. */
const SAMPLER = { steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'simple', denoise: 1 } as const;

export interface GenerationRequest {
  /** El texto completo, con su "Length: N seconds" al final (como se entreno el modelo). */
  readonly prompt: string;
  /** Lo que se genera, en segundos (algo mas de lo que debe durar el sonido, para que quepa la cola). */
  readonly seconds: number;
  readonly seed: number;
  /** Cuantos candidatos de una vez (comparten semilla y salen distintos). */
  readonly batch: number;
  /** Donde los guarda ComfyUI, dentro de su carpeta output/ (`ilogic/<id>/tanda`). */
  readonly filenamePrefix: string;
}

export function generationGraph(request: GenerationRequest): ComfyGraph {
  return {
    model: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: STABLE_AUDIO_3.checkpoint } },
    textEncoder: { class_type: 'CLIPLoader', inputs: { clip_name: STABLE_AUDIO_3.textEncoder, type: 'stable_audio', device: 'default' } },
    prompt: { class_type: 'CLIPTextEncode', inputs: { clip: ['textEncoder', 0], text: request.prompt } },
    noPrompt: { class_type: 'CLIPTextEncode', inputs: { clip: ['textEncoder', 0], text: '' } },
    silence: { class_type: 'EmptyLatentAudio', inputs: { seconds: request.seconds, batch_size: request.batch } },
    sampler: {
      class_type: 'KSampler',
      inputs: {
        model: ['model', 0],
        positive: ['prompt', 0],
        negative: ['noPrompt', 0],
        latent_image: ['silence', 0],
        seed: request.seed,
        ...SAMPLER,
      },
    },
    decode: { class_type: 'VAEDecodeAudio', inputs: { samples: ['sampler', 0], vae: ['model', 2] } },
    save: { class_type: 'SaveAudio', inputs: { audio: ['decode', 0], filename_prefix: request.filenamePrefix } },
  };
}

/**
 * Pasa a MP3 y a Opus un audio ya subido a la carpeta input/ de ComfyUI (`input`, con su subcarpeta).
 * Opus va en un contenedor Ogg: el juego lo sirve como `.ogg`, y el MP3 queda para quien no lo toque.
 */
export function encodingGraph(input: string, filenamePrefix: string): ComfyGraph {
  return {
    load: { class_type: 'LoadAudio', inputs: { audio: input } },
    mp3: { class_type: 'SaveAudioMP3', inputs: { audio: ['load', 0], filename_prefix: filenamePrefix, quality: '128k' } },
    opus: { class_type: 'SaveAudioOpus', inputs: { audio: ['load', 0], filename_prefix: filenamePrefix, quality: '128k' } },
  };
}

const isLink = (value: unknown): value is [string, number] => Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';

/**
 * El mismo grafo con los nodos numerados (1, 2, 3...), que es como los guarda ComfyUI: la API acepta
 * nombres, pero para abrirlo a mano en la ventana de ComfyUI mejor como los suyos.
 */
export function withNumberedNodes(graph: ComfyGraph): ComfyGraph {
  const numberOf = new Map(Object.keys(graph).map((name, index) => [name, String(index + 1)]));
  const renumber = (value: unknown): unknown => (isLink(value) ? [numberOf.get(value[0]), value[1]] : value);
  return Object.fromEntries(
    Object.entries(graph).map(([name, node]) => [
      numberOf.get(name),
      {
        class_type: node.class_type,
        inputs: Object.fromEntries(Object.entries(node.inputs).map(([input, value]) => [input, renumber(value)])),
      },
    ]),
  );
}
