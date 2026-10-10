// Pixi view helpers shared by scenes.
import { BlurFilter, Container, Sprite, type Texture } from 'pixi.js';
import { core, fit } from './core';

/**
 * A full-screen backdrop for a 4:3 original image: the image is shown
 * "contained" and the letterbox areas are filled with a blurred, darkened
 * cover-scaled copy, so any aspect ratio looks intentional.
 */
export class Backdrop extends Container {
  private back: Sprite;
  private front: Sprite;
  constructor(tex: Texture, private dw = tex.width, private dh = tex.height) {
    super();
    this.back = new Sprite(tex);
    this.back.filters = [new BlurFilter({ strength: 16, quality: 3 })];
    this.back.tint = 0x777777;
    this.front = new Sprite(tex);
    this.addChild(this.back, this.front);
    this.layout();
  }
  layout(w = core.width, h = core.height) {
    const c = fit(this.dw, this.dh, w, h, true);
    this.back.scale.set(c.scale * 1.05);
    this.back.position.set(c.x - this.dw * c.scale * 0.025, c.y - this.dh * c.scale * 0.025);
    const f = fit(this.dw, this.dh, w, h);
    this.front.scale.set(f.scale);
    this.front.position.set(f.x, f.y);
  }
  /** design → screen transform of the contained image */
  get box() {
    return fit(this.dw, this.dh);
  }
}
