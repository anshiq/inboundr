import { useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import type { ShaderMaterial } from "three"

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;

  const int RAY_COUNT = 18;

  const vec3 BASE = vec3(0.024, 0.035, 0.024);
  const vec3 GREEN = vec3(0.243, 0.812, 0.557);
  const vec3 GOLD = vec3(0.937, 0.773, 0.329);
  const vec3 CORE = vec3(0.878, 0.968, 0.898);

  // Fan spans this angular slice, measured from the off-screen origin.
  const float ANG_MIN = -1.30;
  const float ANG_SPAN = 1.18;

  float hash11(float n) {
    return fract(sin(n * 127.1) * 43758.5453123);
  }

  void main() {
    // On portrait viewports the fan is pulled down so it never crosses the copy.
    float narrow = 1.0 - smoothstep(0.6, 1.1, uAspect);

    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    vec2 origin = vec2(mix(-0.45, -0.70, narrow) * uAspect, mix(0.95, 0.46, narrow));
    vec2 d = p - origin;
    float r = length(d);

    float ang = atan(d.y, d.x) + 0.06 * sin(r * 0.9);
    float fanT = (ang - ANG_MIN) / ANG_SPAN;

    float atten = smoothstep(0.15, 0.75, r) * exp(-max(r - 1.7, 0.0) * 0.55);

    vec3 col = vec3(0.0);

    for (int i = 0; i < RAY_COUNT; i++) {
      float fi = float(i);
      float s1 = hash11(fi + 1.0);
      float s2 = hash11(fi + 11.3);
      float s3 = hash11(fi + 27.7);

      float pos = (fi + 0.5) / float(RAY_COUNT)
        + (s1 - 0.5) * 0.055
        + 0.010 * sin(uTime * (0.10 + 0.09 * s2) + s1 * 6.283);

      float width = mix(0.0012, 0.009, s2 * s2);
      float q = min(abs(fanT - pos) / width, 12.0);

      float core = exp(-q * q);
      float bloom = exp(-q * q / 7.0) * 0.35;
      float halo = exp(-q * q / 34.0) * 0.07;

      float bright = mix(0.10, 1.6, s3) * (0.80 + 0.20 * sin(uTime * 0.25 + s2 * 6.283));
      vec3 tint = mix(GREEN, GOLD, s1 * 0.7);

      col += (core * (CORE * 1.15 + tint * 0.5) + (bloom + halo) * tint) * bright;
    }

    col *= atten;

    col += GREEN * 0.035 * exp(-length(p - vec2(0.18 * uAspect, -0.05)) * 2.2);
    col += GOLD * 0.018 * exp(-length(p - vec2(0.85 * uAspect, 0.02)) * 2.6);

    // Keep the copy area near-black so the headline and CTAs stay legible.
    float maskStart = mix(0.24, 0.08, narrow);
    float maskEnd = mix(0.76, 0.40, narrow);
    col *= mix(0.03, 1.0, 1.0 - smoothstep(maskStart, maskEnd, vUv.y));
    col *= 1.0 - smoothstep(0.55, 1.0, vUv.x) * mix(0.7, 0.3, narrow);

    float dither = (hash11(vUv.x * 371.0 + vUv.y * 913.0) - 0.5) * 0.008;

    gl_FragColor = vec4(BASE + col + dither, 1.0);
  }
`

function Rays({ animate }: { animate: boolean }) {
  const material = useRef<ShaderMaterial>(null)
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  const invalidate = useThree((state) => state.invalidate)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: 1 },
    }),
    []
  )

  useEffect(() => {
    if (!material.current) return
    material.current.uniforms.uAspect.value = width / Math.max(height, 1)
    invalidate()
  }, [width, height, invalidate])

  useFrame((state) => {
    if (!animate || !material.current) return
    material.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

interface LightRaysCanvasProps {
  animate: boolean
  paused: boolean
}

export default function LightRaysCanvas({ animate, paused }: LightRaysCanvasProps) {
  return (
    <Canvas
      flat
      dpr={[1, 1.75]}
      frameloop={!animate ? "demand" : paused ? "never" : "always"}
      gl={{ antialias: false, alpha: false, powerPreference: "low-power" }}
      className="!absolute inset-0"
    >
      <Rays animate={animate} />
    </Canvas>
  )
}
