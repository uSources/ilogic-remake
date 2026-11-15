/**
 * Efectos de un momento (un proyectil, unas chispas, un numero que sube): se crean, se animan con el
 * reloj del mundo y se quitan solos. No saben de reglas ni de la partida: reciben puntos del mundo.
 */
import * as THREE from 'three';

/** Lo que necesita un efecto: donde ponerse y el reloj del mundo. */
export interface FxHost {
  layer: THREE.Object3D;
  animate(seconds: number, step: (progress: number) => void): Promise<void>;
}

const SHELL_COLOR = 0xfff3a0;
const SPARK_COLORS = [0xffd447, 0xff8a3d, 0xfff3a0] as const;
const SPARKS = 8;
const SPARK_SECONDS = 0.35;
const TEXT_SECONDS = 0.8;
/** Altura del arco por casilla de distancia (los disparos de lejos van por arriba). */
const ARC_PER_TILE = 0.35;

const shellGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
const sparkGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const glowMaterials = new Map<number, THREE.MeshBasicMaterial>();

/** Material que brilla por si mismo (sin luz): los efectos se ven aunque esten en sombra. */
function glow(color: number): THREE.MeshBasicMaterial {
  let material = glowMaterials.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color });
    glowMaterials.set(color, material);
  }
  return material;
}

/** Un proyectil de `from` a `to`; en arco si `arched` (artilleria, misiles). */
export async function projectile(host: FxHost, from: THREE.Vector3, to: THREE.Vector3, arched: boolean): Promise<void> {
  const shell = new THREE.Mesh(shellGeometry, glow(SHELL_COLOR));
  host.layer.add(shell);
  const arc = arched ? from.distanceTo(to) * ARC_PER_TILE : 0;
  const seconds = 0.18 + from.distanceTo(to) * 0.05;
  await host.animate(seconds, (progress) => {
    shell.position.lerpVectors(from, to, progress);
    shell.position.y += Math.sin(progress * Math.PI) * arc;
  });
  host.layer.remove(shell);
}

/** Unas chispas que salen de `at` en todas direcciones y caen. */
export async function sparks(host: FxHost, at: THREE.Vector3, power = 1): Promise<void> {
  const pieces = Array.from({ length: SPARKS }, (_, index) => {
    const spark = new THREE.Mesh(sparkGeometry, glow(SPARK_COLORS[index % SPARK_COLORS.length]!));
    const angle = (index / SPARKS) * Math.PI * 2;
    const velocity = new THREE.Vector3(Math.cos(angle), 1.2 + (index % 3) * 0.4, Math.sin(angle)).multiplyScalar(0.9 * power);
    host.layer.add(spark);
    return { spark, velocity };
  });
  await host.animate(SPARK_SECONDS, (progress) => {
    for (const { spark, velocity } of pieces) {
      spark.position.copy(at).addScaledVector(velocity, progress * SPARK_SECONDS);
      spark.position.y -= 2.5 * (progress * SPARK_SECONDS) ** 2;
      spark.scale.setScalar(1 - progress);
    }
  });
  for (const { spark } of pieces) host.layer.remove(spark);
}

function textTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const draw = canvas.getContext('2d')!;
  draw.font = "bold 36px 'Silkscreen', monospace";
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  draw.lineWidth = 8;
  draw.strokeStyle = '#0b1220';
  draw.strokeText(text, 64, 26);
  draw.fillStyle = color;
  draw.fillText(text, 64, 26);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Un texto (el daño) que sube desde `at` y se desvanece. */
export async function floatingText(host: FxHost, at: THREE.Vector3, text: string, color: string): Promise<void> {
  const material = new THREE.SpriteMaterial({ map: textTexture(text, color), depthTest: false, transparent: true });
  const label = new THREE.Sprite(material);
  label.scale.set(0.8, 0.3, 1);
  label.renderOrder = 20;
  host.layer.add(label);
  await host.animate(TEXT_SECONDS, (progress) => {
    label.position.copy(at).add(new THREE.Vector3(0, 0.3 + progress * 0.5, 0));
    material.opacity = progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4;
  });
  host.layer.remove(label);
  material.map?.dispose();
  material.dispose();
}
