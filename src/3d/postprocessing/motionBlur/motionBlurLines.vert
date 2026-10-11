attribute vec3 position;

uniform sampler2D u_texture;
uniform sampler2D u_motionTexture;

uniform vec2 u_resolution;
uniform float u_maxDistance;
uniform float u_jitter;
uniform float u_motionMultiplier;
uniform float u_leaning;
uniform vec2 u_clipPlanes;
uniform vec2 u_focusRange;
uniform float u_depthStrength;
uniform float u_depthMotionMultiplier;

#pragma glslify: farDepthWeight = require(./depthWeight.glsl)

varying vec3 v_color;
varying float v_ratio;
varying float v_depth;
varying vec2 v_uv;
varying float v_farWeight;

void main() {

    v_color = texture2D( u_texture, position.xy ).rgb;

    float side = step(0.001, position.z);

    v_ratio = side;

    vec4 motion = texture2D( u_motionTexture, position.xy );
    v_depth = motion.z;
    v_farWeight = farDepthWeight(motion, u_clipPlanes, u_focusRange);

    float motionWeight = mix(1.0, v_farWeight * u_depthMotionMultiplier, u_depthStrength);
    vec2 offset = motion.xy * u_resolution * u_motionMultiplier * motionWeight;
    float offsetDistance = length(offset);
    if(offsetDistance > u_maxDistance) {
        offset = normalize(offset) * u_maxDistance;
    }

    vec2 pos = position.xy * 2.0 - 1.0 - offset / u_resolution * 2.0 * (1.0 - position.z * u_jitter) * (side - u_leaning);
    v_uv = pos * 0.5 + 0.5;

    gl_Position = vec4( pos, 0.0, 1.0 );

}
