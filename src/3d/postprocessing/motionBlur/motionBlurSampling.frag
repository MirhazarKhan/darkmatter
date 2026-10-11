
uniform sampler2D u_texture;
uniform sampler2D u_motionTexture;

uniform vec2 u_resolution;
uniform float u_maxDistance;
uniform float u_motionMultiplier;
uniform float u_leaning;
uniform vec2 u_clipPlanes;
uniform vec2 u_focusRange;
uniform float u_depthStrength;
uniform float u_depthMotionMultiplier;

#pragma glslify: farDepthWeight = require(./depthWeight.glsl)

varying vec2 v_uv;


void main() {

    vec4 motionInfo = texture2D( u_motionTexture, v_uv );
    float farWeight = farDepthWeight(motionInfo, u_clipPlanes, u_focusRange);
    vec2 motion = motionInfo.xy;

    float motionWeight = mix(1.0, farWeight * u_depthMotionMultiplier, u_depthStrength);
    vec2 offset = motion * u_resolution * u_motionMultiplier * motionWeight;
    float offsetDistance = length(offset);
    if(offsetDistance > u_maxDistance) {
        offset = normalize(offset) * u_maxDistance;
    }
    vec2 delta = - offset / u_resolution * 2.0 / float(SAMPLE_COUNT);
    vec2 pos = v_uv - delta * u_leaning * float(SAMPLE_COUNT);
    vec3 color = vec3(0.0);
    float weight = 0.0;

    for(int i = 0; i < SAMPLE_COUNT; i++) {
        vec4 sampleMotion = texture2D(u_motionTexture, pos);
        float sampleFar = farDepthWeight(sampleMotion, u_clipPlanes, u_focusRange);
        float valid = mix(1.0, sampleFar, step(0.001, sampleMotion.a));
        valid = mix(1.0, valid, u_depthStrength);
        color += texture2D( u_texture, pos ).rgb * valid;
        weight += valid;
        pos += delta;
    }

    vec3 center = texture2D(u_texture, v_uv).rgb;
    gl_FragColor = vec4(mix(center, color / max(weight, 0.0001),
        mix(1.0, farWeight, u_depthStrength)), 1.0);

}
