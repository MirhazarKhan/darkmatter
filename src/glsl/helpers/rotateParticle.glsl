vec3 rotateParticle(vec3 vertex, float phase) {
    // A full turn spans two original triangle flips. Rotation keeps area constant.
    float angle = phase * 3.141592653589793;
    float cosine = cos(angle);
    float sine = sin(angle);
    mat2 rotation = mat2(cosine, sine, -sine, cosine);
    return vec3(rotation * vertex.xy, vertex.z);
}

#pragma glslify: export(rotateParticle)
