varying vec4  vColor;
varying float vFade;

void main() {
  if (vColor.a < 0.01) discard;
  vec2 c = gl_PointCoord - 0.5;
  if (length(c) > 0.5) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * max(0.0, vFade));
}
