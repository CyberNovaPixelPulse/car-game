import * as THREE from "three";

/**
 * Field weathering painted in the shader, so the baked atlas stays shared:
 * caked mud up the running gear and lower hull, splashes above it, pale dust
 * settled on upward faces, and darker grime streaking down the sides. Noise
 * runs in mesh-local space so it travels with the tank instead of sliding
 * over it; height comes from world Y because the battlefield is flat.
 */
export function weather(
  material: THREE.MeshStandardMaterial,
  seed: number,
  amount = 1,
) {
  const uniforms = {
    uWeatherSeed: { value: seed },
    uWeatherAmount: { value: amount },
  };
  material.userData.weather = uniforms;
  material.customProgramCacheKey = () => "tank-weathering-v1";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWeatherLocal;
        varying float vWeatherHeight;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 weatherAt = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          weatherAt = instanceMatrix * weatherAt;
        #endif
        vWeatherLocal = weatherAt.xyz;
        vWeatherHeight = (modelMatrix * weatherAt).y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uWeatherSeed;
        uniform float uWeatherAmount;
        varying vec3 vWeatherLocal;
        varying float vWeatherHeight;
        float weatherHash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13) + uWeatherSeed);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float weatherNoise(vec3 x) {
          vec3 i = floor(x), f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(weatherHash(i), weatherHash(i + vec3(1, 0, 0)), f.x),
                mix(weatherHash(i + vec3(0, 1, 0)), weatherHash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(weatherHash(i + vec3(0, 0, 1)), weatherHash(i + vec3(1, 0, 1)), f.x),
                mix(weatherHash(i + vec3(0, 1, 1)), weatherHash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
        }
        float weatherFbm(vec3 x) {
          return 0.55 * weatherNoise(x) + 0.3 * weatherNoise(x * 2.3) + 0.15 * weatherNoise(x * 5.1);
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
          float broad = weatherFbm(vWeatherLocal * 1.7);
          float fine = weatherNoise(vWeatherLocal * 9.0);
          // Caked mud: a ragged line about knee height, thickest at the tracks.
          float mud = smoothstep(1.05, 0.2, vWeatherHeight + (broad - 0.5) * 0.7);
          // Thrown-up splashes a little higher.
          float splash = step(0.74, weatherFbm(vWeatherLocal * 6.0)) *
            smoothstep(1.7, 0.7, vWeatherHeight);
          mud = max(mud, splash * 0.8) * uWeatherAmount;
          vec3 mudTone = mix(vec3(0.16, 0.12, 0.08), vec3(0.3, 0.24, 0.16), fine);
          diffuseColor.rgb = mix(diffuseColor.rgb, mudTone, mud * 0.82);
          // Dust settled on decks and the turret roof.
          float up = smoothstep(0.5, 0.95, worldNormal.y);
          float dust = up * (0.35 + 0.5 * broad) * smoothstep(0.6, 1.4, vWeatherHeight);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.53, 0.43), dust * 0.38 * uWeatherAmount);
          // Rain and oil streaks down the vertical faces.
          float side = 1.0 - abs(worldNormal.y);
          float streak = weatherNoise(vWeatherLocal * vec3(7.0, 0.6, 7.0)) * side;
          diffuseColor.rgb *= 1.0 - smoothstep(0.55, 0.95, streak) * 0.22 * uWeatherAmount;
          // Speckled chipping and grime everywhere.
          diffuseColor.rgb *= 1.0 - step(0.86, fine) * 0.12 * uWeatherAmount;
          roughnessFactor = mix(roughnessFactor, 1.0, max(mud, dust) * uWeatherAmount);
        }`,
      );
  };
  material.needsUpdate = true;
  return material;
}

let next = 1;
/** A different pattern for every tank in a battle. */
export function weatherSeed() {
  next = (next * 48271) % 2147483647;
  return (next % 997) / 997;
}
