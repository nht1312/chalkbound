import { ACESFilmicToneMapping, PerspectiveCamera, WebGLRenderer } from 'three';

export interface RendererConfig {
  readonly maxPixelRatio: number;
}

export interface RendererHandle {
  readonly renderer: WebGLRenderer;
  dispose(): void;
}

/** Creates the WebGL renderer and keeps it (and the camera aspect) in sync with the window. */
export function createRenderer(
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  config: RendererConfig,
): RendererHandle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = ACESFilmicToneMapping;

  const resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.maxPixelRatio));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return {
    renderer,
    dispose() {
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
