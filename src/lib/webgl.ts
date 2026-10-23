export type WebGLSupport = "webgl2" | "webgl" | "none";

/** Probe for a WebGL context without keeping it alive. */
export function detectWebGL(): WebGLSupport {
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    if (gl2) {
      gl2.getExtension("WEBGL_lose_context")?.loseContext();
      return "webgl2";
    }
    const gl = canvas.getContext("webgl");
    if (gl) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return "webgl";
    }
  } catch {
    // Some privacy modes throw instead of returning null.
  }
  return "none";
}
