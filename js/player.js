import { circleHitsTriangle, distSqToBox } from "./collisions.js";
import { PHYSICS as P } from "./physics.js";

// The runner. Moves right at the level's speed; the only control is jump.
// All logic runs in fixed 1/60 s steps (see loop.js), so it is deterministic.
//
// `world` is { groundY, obstacles, pits, slack }:
//   obstacles  spikes and blocks, sorted by baseLeft. top/bottom come from groundY, elev and h.
//   pits       gaps in the floor, sorted by left.
//   slack      how far a sliding obstacle can be from its base position (0 when nothing slides).
export class Player {
  constructor(groundY = 336) {
    this.reset(groundY);
  }

  reset(groundY = this.groundY) {
    this.groundY = groundY;
    this.x = 0;
    this.y = groundY - P.radius;
    this.vy = 0;
    this.grounded = true;
    this.angle = 0;
    // what happened during the latest step, so the game can react (sound, particles)
    this.jumped = false;
    this.landed = false;
    this.dead = false;
    this.coyote = 0;
    this.buffer = 0;
  }

  step(dt, speed, input, world) {
    const groundY = world.groundY;
    this.jumped = false;
    this.landed = false;
    const wasGrounded = this.grounded;

    // Jump buffer and coyote time: forgiveness on both sides of the jump.
    this.buffer = input.pressed ? P.jumpBuffer : this.buffer - dt;
    this.coyote = this.grounded ? P.coyoteTime : this.coyote - dt;
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = -P.jumpVelocity;
      this.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
      this.jumped = true;
    }

    // Gravity. Rising with the button released pulls harder, which makes jump height variable.
    const g = P.gravity * (this.vy < 0 ? (input.held ? 1 : P.cutGravityScale) : P.fallGravityScale);
    this.vy = Math.min(this.vy + g * dt, P.maxFallSpeed);

    const prevBottom = this.y + P.radius;
    this.x += speed * dt;
    this.y += this.vy * dt;
    this.grounded = false;

    if (this.y + P.radius >= groundY) {
      if (this.floorAt(this.x, world.pits)) {
        this.y = groundY - P.radius;
        this.vy = 0;
        this.grounded = true;
      } else if (this.y + P.radius > groundY + P.pitDepth) {
        this.dead = true; // sank into a gap in the floor
        return;
      }
    }

    const slack = world.slack || 0;
    for (const o of world.obstacles) {
      if (o.right < this.x - P.radius - 2) continue;
      if (o.baseLeft - slack > this.x + P.radius + 2) break; // sorted by baseLeft: nothing further can touch us
      if (o.kind === "block") this.collideBlock(o, prevBottom, groundY);
      else if (this.hitsSpike(o, groundY)) this.dead = true;
      if (this.dead) return;
    }

    this.landed = !wasGrounded && this.grounded;
    this.angle += (speed * dt * (this.grounded ? 1 : 0.6)) / P.radius;
  }

  // Is there floor under x? The runner still counts as supported while overhanging a pit's edge by a little.
  floorAt(x, pits) {
    for (const pit of pits) {
      if (pit.left > x + P.radius) break;
      if (x > pit.left + P.pitEdge && x < pit.right - P.pitEdge) return false;
    }
    return true;
  }

  // Land on the top; anything else that touches the block is deadly.
  collideBlock(o, prevBottom, groundY) {
    const R = P.radius;
    const bottom = groundY - o.elev;
    const top = bottom - o.h;
    if (distSqToBox(this.x, this.y, o.left, top, o.right, bottom) >= R * R) return;

    const fromAbove = this.vy >= 0 && prevBottom <= top + P.landTolerance;
    const overTop = this.x >= o.left - R * 0.5 && this.x <= o.right + R * 0.5;
    if (fromAbove && overTop) {
      this.y = top - R;
      this.vy = 0;
      this.grounded = true;
      return;
    }
    if (distSqToBox(this.x, this.y, o.left, top, o.right, bottom) < P.hitRadius * P.hitRadius) this.dead = true;
  }

  // The killing shape is a slightly smaller triangle than the drawn one.
  hitsSpike(o, groundY) {
    const bottom = groundY - o.elev;
    const w = o.right - o.left;
    return circleHitsTriangle(
      this.x, this.y, P.hitRadius,
      o.left + w * 0.2, bottom,
      o.right - w * 0.2, bottom,
      o.left + w / 2, bottom - o.h * 0.85
    );
  }
}
