uniform sampler2D texturePosition;
uniform sampler2D texturePrevPosition;
uniform float deltaRatio;
uniform float moving;
uniform float possession;
attribute vec2 fboUV;

#pragma glslify: possessionMask = require(./helpers/possessionMask.glsl)

varying float vAlong;
varying float vSide;
varying float vLife;
varying float vValid;
varying float vPossession;

void main() {
    vec4 current = texture2D(texturePosition, fboUV);
    vec4 previous = texture2D(texturePrevPosition, fboUV);
    vec4 head = modelViewMatrix * vec4(current.xyz, 1.0);
    vec4 last = modelViewMatrix * vec4(previous.xyz, 1.0);
    vec3 displacement = head.xyz - last.xyz;
    float planarDistance = length(displacement.xy);
    vec2 tangent = displacement.xy / max(0.00001, planarDistance);
    vec2 normal = vec2(-tangent.y, tangent.x);

    // Normalize against simulation time so slow motion slows movement without losing the tail.
    float tailLength = min(8.0, planarDistance * 6.0 / deltaRatio);
    float alive = smoothstep(0.0, 0.2, current.w);
    float halfWidth = mix(0.58, 0.025, position.x) * alive;
    head.xy -= tangent * tailLength * position.x;
    head.xy += normal * position.y * halfWidth;
    head.z -= 0.8;

    vAlong = position.x;
    vSide = position.y;
    vLife = current.w;
    vPossession = possessionMask(current.xyz, fboUV, possession);
    // Life jumps upward on respawn. Suppress those discontinuities rather than drawing long streaks.
    vValid = moving * step(current.w, previous.w + 0.0001)
        * (1.0 - step(48.0, length(displacement))) * step(0.00001, planarDistance);
    gl_Position = projectionMatrix * head;
}
