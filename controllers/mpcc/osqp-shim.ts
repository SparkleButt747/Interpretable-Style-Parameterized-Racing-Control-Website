/**
 * Minimal shim used when the OSQP module is unavailable at build/runtime.
 * Replace by the real solver once the emscripten bundle is wired up.
 */

const shim = {
  solve: () => {
    throw new Error('OSQP shim invoked; real solver not loaded');
  },
};

export default shim;
