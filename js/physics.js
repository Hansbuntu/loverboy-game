// Every number that decides how the runner moves. Units are pixels of the game field
// (640x400 on desktop, 500 wide on portrait phones) and seconds. Tweak here; nothing else hardcodes feel.
export const PHYSICS = {
  gravity: 1900,            // px/s^2
  fallGravityScale: 1.1,    // falling is a touch faster than rising: snappier landings
  cutGravityScale: 3.0,     // extra gravity while rising with jump released: tap = hop, hold = full leap
  jumpVelocity: 630,        // a full leap peaks ~104 px up and stays airborne ~0.66 s
  maxFallSpeed: 1100,

  coyoteTime: 0.08,         // can still jump this long after running off an edge
  jumpBuffer: 0.10,         // a press this long before landing still jumps on landing

  radius: 15,               // what the runner stands on
  hitRadius: 12.5,          // what actually kills: a little smaller, so near-misses feel fair
  landTolerance: 9,         // how far below a block's top edge a landing is still forgiven
  pitEdge: 8,               // the runner can overhang a pit's edge this far and still stand
  pitDepth: 6,              // sinking this far below the floor line, unsupported, means you fell in

  floorHeight: 64,          // thickness of the floor band under the running surface
  playerX: 0.235,           // where the runner sits across the view (fraction of its width)
  spikeSize: 28
};

// The running surface's y for a field of the given height.
export function groundYFor(fieldHeight) {
  return fieldHeight - PHYSICS.floorHeight;
}
