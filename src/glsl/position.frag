uniform vec2 resolution;
uniform sampler2D texturePosition;
uniform sampler2D textureDefaultPosition;
uniform float time;
uniform float speed;
uniform float dieSpeed;
uniform float radius;
uniform float curlSize;
uniform float attraction;
uniform float initAnimation;
uniform vec3 mouse3d;
uniform sampler2D targetTextureA;
uniform sampler2D targetTextureB;
uniform float targetMix;
uniform float targetStrength;
uniform float deltaRatio;
uniform float intensity;
uniform float burst;
uniform float ringFormation;
uniform float ringTime;
uniform float awaken;
uniform float awakenTime;
uniform float scorePulse;
uniform float titleFormation;
uniform sampler2D titleTexture;
uniform float titleAspect;
uniform float burstFlash;

#pragma glslify: curl = require(./helpers/curl4)
#pragma glslify: ringPosition = require(./helpers/ringPosition.glsl)
#pragma glslify: chargedPosition = require(./helpers/chargedPosition.glsl)

void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 positionInfo = texture2D( texturePosition, uv );
    vec3 position = mix(vec3(0.0, -200.0, 0.0), positionInfo.xyz, smoothstep(0.0, 0.3, initAnimation));
    float life = positionInfo.a - dieSpeed;

    vec3 followPosition = mix(vec3(0.0, -(1.0 - initAnimation) * 200.0, 0.0), mouse3d, smoothstep(0.2, 0.7, initAnimation));
    float formation = targetStrength * smoothstep(0.1, 0.85, initAnimation);
    float ring = clamp(ringFormation, 0.0, 1.0);
    float title = clamp(titleFormation, 0.0, 1.0);
    float awake = clamp(awaken, 0.0, 1.0);
    vec3 ringTarget = vec3(0.0);
    if (ring > 0.0) {
        vec3 ringNormal;
        ringTarget = ringPosition(uv - 0.5 / resolution, ringTime, ringNormal);
        if (awake > 0.0) {
            ringTarget = mix(ringTarget, chargedPosition(uv - 0.5 / resolution, awakenTime, scorePulse), awake);
        }
    }
    vec3 targetPosition = vec3(0.0);
    if (formation > 0.0) {
        targetPosition = mix(texture2D(targetTextureA, uv).xyz, texture2D(targetTextureB, uv).xyz, targetMix);
    }

    if(life < 0.0) {
        vec3 carriedPosition = position;
        positionInfo = texture2D( textureDefaultPosition, uv );
        position = positionInfo.xyz * (1.0 + sin(time * 15.0) * 0.2 + (1.0 - initAnimation)) * 0.4 * radius;
        position += followPosition;
        if (formation > 0.0) position = mix(position, targetPosition, formation);
        // Morphs and the impact keep each particle's spatial history while its
        // brightness cycles, including the free flight between ring and title.
        float continuity = max(max(ring, title), max(awake, burstFlash));
        if (continuity > 0.0) position = mix(position, carriedPosition, continuity);
        life = 0.5 + fract(positionInfo.w * 21.4131 + time);
    } else {
        vec3 delta = followPosition - position;
        position += delta * (0.005 + life * 0.01) * attraction * (1.0 - smoothstep(50.0, 350.0, length(delta))) * speed * (1.0 - formation) * (1.0 - ring) * (1.0 - title);
        position += curl(position * curlSize, time, 0.1 + (1.0 - life) * 0.1) * speed * mix(1.0, 0.15 + intensity * 0.55, formation) * (1.0 - ring * 0.96) * (1.0 - title * 0.99);
        if (burst > 0.0) position += normalize(position - followPosition + vec3(0.001)) * burst * speed * 5.0;
        if (formation > 0.0) {
            vec3 drift = vec3(sin(time * 0.9 + uv.x * 12.0), cos(time * 0.7 + uv.y * 12.0), sin(time * 0.8 + uv.x * 8.0)) * intensity * 2.0;
            drift += clamp(mouse3d, vec3(-250.0), vec3(250.0)) * intensity * 0.025;
            position += (targetPosition + drift - position) * (1.0 - exp(-0.085 * deltaRatio)) * formation * (1.0 - ring) * (1.0 - title);
        }
    }

    if (ring > 0.0) {
        position += (ringTarget - position) * (1.0 - exp(-0.20 * deltaRatio)) * ring * (1.0 - burstFlash) * (1.0 - title);
    }

    if (burstFlash > 0.0) {
        vec3 radial = normalize(position - vec3(0.0, 50.0, 0.0) + vec3(0.001));
        vec3 twist = cross(radial, vec3(0.0, 0.0, 1.0));
        position += (radial * 36.0 + twist * 11.0) * burstFlash * deltaRatio * (1.0 - title);
    }

    if (title > 0.0) {
        vec4 lettering = texture2D(titleTexture, uv);
        float cameraZ = max(670.0, 610.0 / titleAspect);
        float scale = min(0.85 * 0.828427 * cameraZ * titleAspect / 526.0,
            0.57 * 0.828427 * cameraZ / 282.0);
        vec3 titleTarget = lettering.xyz;
        titleTarget.x *= scale;
        titleTarget.y = (titleTarget.y - 50.0) * scale + 50.0;
        float dust = 1.0 - lettering.w;
        titleTarget += vec3(sin(time * 0.14 + uv.x * 26.0),
            cos(time * 0.12 + uv.y * 21.0), sin(time * 0.16 + uv.x * 31.0)) * mix(0.40, 24.0, dust);
        position += (titleTarget - position) * (1.0 - exp(-0.17 * deltaRatio)) * title;
    }

    gl_FragColor = vec4(position, life);

}
