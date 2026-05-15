attribute vec2  aOrigin;
attribute float aR1;
attribute float aR2;

uniform sampler2D uTexture;
uniform float     uStep;
uniform float     uDpr;

uniform vec2  uDecompCenter;
uniform float uDecompRadius;
uniform float uDecompFalloff;
uniform float uDecompMode;    // 0 = radial, 1 = linear
uniform float uDecompAngle;
uniform float uNoiseAmount;
uniform float uNoiseScale;
uniform float uScatterDist;
uniform float uEdgeSoftness;

varying vec4  vColor;
varying float vFade;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vColor = texture2D(uTexture, aOrigin);

  vec2 pos = aOrigin * 2.0 - 1.0;
  pos.y *= -1.0;

  // Base distance for decomposition boundary
  float d;
  if (uDecompMode < 0.5) {
    d = length(pos - uDecompCenter) - uDecompRadius;
  } else {
    vec2 dir = vec2(cos(uDecompAngle), sin(uDecompAngle));
    d = dot(pos - uDecompCenter, dir);
  }

  // Organic boundary via noise
  float n = (vnoise(aOrigin * uNoiseScale) - 0.5) * 2.0 * uNoiseAmount;
  d += n;

  float halfFall = max(uDecompFalloff * 0.5, 0.001);
  float t = smoothstep(-halfFall, halfFall, d);

  float softHalf = halfFall * (1.0 + uEdgeSoftness * 2.0);
  float alphaT = smoothstep(-softHalf, softHalf, d);
  vFade = 1.0 - alphaT;

  // Progressive jitter: particles near the boundary get random displacement
  // BEFORE scattering, gradually breaking the pixel grid (like progressive blur).
  float jitterZone = halfFall * uEdgeSoftness * 2.5;
  float jitterT = smoothstep(-jitterZone, halfFall * 0.3, d);
  float jAngle = hash(aOrigin * 137.3) * 6.2832;
  float jRand = 0.3 + hash(aOrigin * 271.7) * 0.7;
  pos += vec2(cos(jAngle), sin(jAngle)) * jitterT * uEdgeSoftness * 0.012 * jRand;

  vec2 randomDir = vec2(cos(aR1 * 6.2832), sin(aR1 * 6.2832));
  vec2 fromCenter = pos - uDecompCenter;
  float fromLen = length(fromCenter);
  vec2 awayDir = fromLen > 0.001 ? fromCenter / fromLen : randomDir;
  vec2 scatterDir = normalize(mix(awayDir, randomDir, 0.35));

  float amount = uScatterDist * (0.25 + aR2 * 0.75);
  pos += scatterDir * amount * t;

  gl_Position = vec4(pos, 0.0, 1.0);

  float restSize = uStep * uDpr;
  float dotSize = max(0.5, 0.5 + aR1 * 0.8);
  float sizeJitter = jitterT * hash(aOrigin * 413.5) * uEdgeSoftness * 0.4;
  gl_PointSize = max(0.5, mix(restSize * (1.0 - sizeJitter), dotSize, t));
}
