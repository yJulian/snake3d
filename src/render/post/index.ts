// STUB – replaced in phase 2
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { PostProcessor } from '../../contracts';

export function createPostProcessor(webgl: WebGLRenderer, scene: Scene, camera: Camera): PostProcessor {
  return {
    update() {},
    render: () => webgl.render(scene, camera),
    resize() {},
    dispose() {},
  };
}
