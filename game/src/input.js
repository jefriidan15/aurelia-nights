// Aurelia Nights — keyboard + mouse input state.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.clicked = false;      // true for one frame after a click
    this.pressed = new Set();  // keys pressed this frame (edge-triggered)
    this._down = (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    };
    this._up = (e) => this.keys.delete(e.code);
    this._move = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    };
    this._mdown = (e) => { this._move(e); this.mouseDown = true; this.clicked = true; };
    this._mup = () => { this.mouseDown = false; };
    this._blur = () => { this.keys.clear(); this.mouseDown = false; };
    addEventListener("keydown", this._down);
    addEventListener("keyup", this._up);
    addEventListener("blur", this._blur);
    canvas.addEventListener("mousemove", this._move);
    canvas.addEventListener("mousedown", this._mdown);
    addEventListener("mouseup", this._mup);
  }
  down(code) { return this.keys.has(code); }
  any(...codes) { return codes.some((c) => this.keys.has(c)); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.clicked = false; }
  axis() {
    const x = (this.any("KeyD", "ArrowRight") ? 1 : 0) - (this.any("KeyA", "ArrowLeft") ? 1 : 0);
    const y = (this.any("KeyS", "ArrowDown") ? 1 : 0) - (this.any("KeyW", "ArrowUp") ? 1 : 0);
    return { x, y };
  }
}
