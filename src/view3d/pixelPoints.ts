/**
 * Muchas particulas cuadradas (pixeles de juguete) en una sola llamada de dibujo: copos, polvo,
 * motas. Cada una tiene su sitio, su tamaño (en casillas: de cerca se ve mas grande) y su opacidad,
 * que se cambian cada fotograma desde fuera; aqui solo se dibujan.
 */
import * as THREE from 'three';

const VERTEX = /* glsl */ `
attribute float aAlpha;
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = aSize * uScale / -viewPosition.z;
  vAlpha = aAlpha;
  vColor = aColor;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(uColor * vColor, uOpacity * vAlpha);
  #include <colorspace_fragment>
}
`;

export class PixelPoints {
  readonly object: THREE.Points;
  readonly positions: Float32Array;
  readonly alphas: Float32Array;
  readonly sizes: Float32Array;
  /** El color de cada una (por el de todas, `setLook`); sin tocar, blanco. */
  readonly colors: Float32Array;
  private readonly material: THREE.ShaderMaterial;

  constructor(readonly count: number) {
    this.positions = new Float32Array(count * 3);
    this.alphas = new Float32Array(count);
    this.sizes = new Float32Array(count);
    this.colors = new Float32Array(count * 3).fill(1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 }, uScale: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geometry, this.material);
    // Las particulas se mueven por todo el mapa: su caja de recorte nunca se calcula bien.
    this.object.frustumCulled = false;
  }

  setLook(color: THREE.ColorRepresentation, opacity: number): void {
    (this.material.uniforms.uColor!.value as THREE.Color).set(color);
    this.material.uniforms.uOpacity!.value = opacity;
  }

  /** Pasa de casillas a pixeles de pantalla segun la ventana y la camara (al cambiar de tamaño). */
  setScale(viewportHeight: number, camera: THREE.PerspectiveCamera): void {
    this.material.uniforms.uScale!.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }

  /** Avisa de que se han cambiado sitios, opacidades o tamaños. */
  commit(): void {
    const attributes = this.object.geometry.attributes;
    attributes.position!.needsUpdate = true;
    attributes.aAlpha!.needsUpdate = true;
    attributes.aSize!.needsUpdate = true;
    attributes.aColor!.needsUpdate = true;
  }
}
