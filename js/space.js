(() => {
'use strict';
const canvas = document.getElementById('glcanvas');
        const glOptions = {
            alpha: false,
            antialias: true,
            desynchronized: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false
        };
        const gl = canvas.getContext('webgl', glOptions) || canvas.getContext('experimental-webgl', glOptions);
        const APP_CONFIG = {
            renderScale: 1,
            maxDevicePixelRatio: 1.5,
            performanceMode: true
        };

        if (!gl) {
            alert('WebGL is not supported. Please use the latest Chrome or Edge.');
            return;
        }

        const vsSource = `
            attribute vec2 aPosition;
            void main() {
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `;

        const fsSource = `
            precision highp float;
            
            uniform vec3 iResolution;
            uniform float iTime;
            uniform float uTravelZ; 
            uniform vec2 uPan;      
            uniform float uChaos;
            uniform float uFinalPanic;

            uniform sampler2D uLogo;
            uniform sampler2D uImage1;
            uniform sampler2D uImage2;
            uniform sampler2D uImage3;
            uniform sampler2D uImage4;
            uniform sampler2D uImage5;

            mat2 rot(float t) {
                float c = cos(t), s = sin(t);
                return mat2(c, -s, s, c);
            }

            float hash21(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float noise2(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash21(i);
                float b = hash21(i + vec2(1.0, 0.0));
                float c = hash21(i + vec2(0.0, 1.0));
                float d = hash21(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                for(int i = 0; i < 5; i++) {
                    v += a * noise2(p);
                    p = rot(0.75) * p * 2.05 + vec2(7.13);
                    a *= 0.5;
                }
                return v;
            }

            float rectInside(vec2 p, vec2 halfSize) {
                vec2 d = step(abs(p), halfSize);
                return d.x * d.y;
            }

            float rectSoft(vec2 p, vec2 halfSize, float feather) {
                vec2 d = abs(p) - halfSize;
                float outside = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                return 1.0 - smoothstep(0.0, feather, outside);
            }

            vec4 pickWallImage(float imageId, vec2 uv) {
                if(imageId < 0.5) return texture2D(uImage1, uv);
                if(imageId < 1.5) return texture2D(uImage2, uv);
                if(imageId < 2.5) return texture2D(uImage3, uv);
                if(imageId < 3.5) return texture2D(uImage4, uv);
                return texture2D(uImage5, uv);
            }

            vec3 wallImages(vec3 baseCol, vec3 hitP, vec3 n) {
                vec2 q = mod(hitP.xz + 20.0, 40.0) - 20.0;
                vec2 roomId = floor((hitP.xz + 20.0) / 40.0);
                float sideId = abs(n.x) > 0.5 ? (n.x > 0.0 ? 0.0 : 1.0) : (n.z > 0.0 ? 2.0 : 3.0);
                vec2 wallUV = abs(n.x) > 0.5 ? vec2(q.y, hitP.y) : vec2(q.x, hitP.y);
                float roomSeed = floor(hash21(roomId + vec2(71.3, 19.8)) * 5.0);

                vec3 col = baseCol;
                float segmentCenterX = wallUV.x < 0.0 ? -13.5 : 13.5;

                vec2 logoSize = vec2(4.8, 1.9);
                vec2 logoLocal = wallUV - vec2(segmentCenterX, 17.3);
                float logoInside = rectInside(logoLocal, logoSize * 0.5);
                vec2 logoUv = logoLocal / logoSize + 0.5;
                logoUv.y = 1.0 - logoUv.y;

                if(
                    logoInside > 0.5 &&
                    logoUv.x >= 0.0 && logoUv.x <= 1.0 &&
                    logoUv.y >= 0.0 && logoUv.y <= 1.0
                ) {
                    vec4 logoTex = texture2D(uLogo, logoUv);
                    col = mix(col, logoTex.rgb, logoTex.a);
                }

                vec2 imageSize = vec2(7.2, 9.6);
                vec2 imageCenter = vec2(segmentCenterX, 9.6);
                vec2 imageLocal = wallUV - imageCenter;
                float imageInside = rectInside(imageLocal, imageSize * 0.5);
                float imageShadow = rectSoft(imageLocal, imageSize * 0.53, 0.45);
                vec2 imageUv = imageLocal / imageSize + 0.5;
                imageUv.y = 1.0 - imageUv.y;
                float imageId = mod(sideId + roomSeed, 5.0);
                vec4 imageTex = pickWallImage(imageId, imageUv);
                col *= 1.0 - imageShadow * 0.16;
                col = mix(col, imageTex.rgb, imageTex.a * imageInside);

                return col;
            }

            float ceilingLightMask(vec2 p) {
                vec2 g = p * vec2(0.10, 0.25) + vec2(2.3, 1.5);
                vec2 cell = fract(g);
                vec2 id = floor(g);
                float selected = step(0.38, hash21(id + vec2(8.0, 2.0)));
                float panel = step(abs(cell.x - 0.5), 0.36) * step(abs(cell.y - 0.5), 0.30);
                return panel * selected;
            }

            float ceilingLightGlow(vec2 p) {
                vec2 g = p * vec2(0.10, 0.25) + vec2(2.3, 1.5);
                vec2 cell = fract(g);
                vec2 id = floor(g);
                float selected = step(0.38, hash21(id + vec2(8.0, 2.0)));
                vec2 d = abs(cell - 0.5) / vec2(0.48, 0.40);
                float boxDist = max(d.x, d.y);
                return (1.0 - smoothstep(0.15, 1.65, boxDist)) * selected;
            }

            vec3 ceilingLightOnWall(vec3 hitP, vec3 n, vec3 camP, vec3 lightP, float power) {
                vec3 L = lightP - hitP;
                float dist = length(L);
                vec3 l = L / max(dist, 0.001);
                vec3 v = normalize(camP - hitP);
                vec3 r = reflect(-v, n);

                float facing = max(dot(n, l), 0.0);
                float reflected = max(dot(r, l), 0.0);
                
                float broadGloss = pow(reflected, 24.0) * 0.25; 
                float sharpGloss = pow(reflected, 144.0) * 0.85; 
                float softSpill = pow(facing, 1.6) * 0.04; 
                float attenuation = power / (1.0 + dist * dist * 0.035);

                return vec3(0.95, 0.98, 1.0) * (softSpill + broadGloss + sharpGloss) * attenuation;
            }

            vec3 wallMetal(vec3 hitP, vec3 n, vec3 camP) {
                vec2 uvWall = abs(n.x) > 0.5 ? hitP.zy : hitP.xy;
                float baseNoise = fbm(uvWall * 0.18);
                float fineGrain = hash21(uvWall * 95.0) - 0.5;

                vec3 darkSilver = vec3(0.28, 0.30, 0.33); 
                vec3 midSilver = vec3(0.55, 0.58, 0.62);  
                vec3 lightSilver = vec3(0.80, 0.85, 0.90); 

                vec3 col = mix(darkSilver, midSilver, smoothstep(0.2, 0.8, baseNoise));
                col = mix(col, lightSilver, smoothstep(0.6, 1.0, baseNoise) * 0.35);
                col += vec3(fineGrain * 0.015);

                vec2 localXZ = mod(hitP.xz + 20.0, 40.0) - 20.0;
                vec2 roomCenter = hitP.xz - localXZ;

                col *= 0.82; 
                col += ceilingLightOnWall(hitP, n, camP, vec3(roomCenter.x - 8.0, 19.7, roomCenter.y - 7.0), 20.0);
                col += ceilingLightOnWall(hitP, n, camP, vec3(roomCenter.x + 8.0, 19.7, roomCenter.y - 7.0), 20.0);
                col += ceilingLightOnWall(hitP, n, camP, vec3(roomCenter.x - 8.0, 19.7, roomCenter.y + 7.0), 20.0);
                col += ceilingLightOnWall(hitP, n, camP, vec3(roomCenter.x + 8.0, 19.7, roomCenter.y + 7.0), 20.0);
                col += ceilingLightOnWall(hitP, n, camP, vec3(roomCenter.x, 19.7, roomCenter.y), 15.0);

                vec3 viewDir = normalize(camP - hitP);
                float grazing = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);
                
                col += vec3(0.25, 0.28, 0.32) * grazing; 

                return clamp(col, 0.0, 1.1);
            }

            vec3 ceiling(vec2 p) {
                vec3 metalPanel = vec3(0.42, 0.44, 0.46); 
                vec2 g = p * vec2(0.10, 0.25) + vec2(2.3, 1.5);
                vec2 cell = fract(g);

                float gridX = 1.0 - smoothstep(0.0, 0.035, min(cell.x, 1.0 - cell.x));
                float gridY = 1.0 - smoothstep(0.0, 0.035, min(cell.y, 1.0 - cell.y));
                float grid = max(gridX, gridY);
                float lightPanel = ceilingLightMask(p);
                float lightGlow = ceilingLightGlow(p);

                vec3 col = metalPanel - grid * 0.10;
                col += vec3(0.12, 0.13, 0.14) * fbm(p * 0.16);
                col = mix(col, vec3(0.88, 0.92, 0.92), lightPanel); 
                col += vec3(0.15, 0.17, 0.18) * lightGlow;
                return col;
            }

            vec3 carpet(vec2 p) {
                vec2 q = p * 0.13;
                float cloud = fbm(q * 3.0 + vec2(iTime * 0.015, -iTime * 0.01));
                float nap = fbm(q * 11.0 + vec2(4.0, 9.0));
                float grain = hash21(p * 42.0);

                vec3 deepRed = vec3(0.20, 0.01, 0.03); 
                vec3 wineRed = vec3(0.40, 0.02, 0.07);
                vec3 velvetRed = vec3(0.68, 0.08, 0.12);

                vec3 col = mix(deepRed, wineRed, smoothstep(0.18, 0.88, cloud));
                col = mix(col, velvetRed, smoothstep(0.58, 0.96, nap) * 0.40);

                vec2 lobeCenter = vec2(sin(iTime * 0.18) * 0.8, cos(iTime * 0.12) * 0.6);
                float softSheen = exp(-dot(q - lobeCenter, q - lobeCenter) * 0.42);
                col += vec3(0.38, 0.05, 0.08) * softSheen * 0.50; 

                float fiber = pow(grain, 8.0) * 0.16 - pow(1.0 - grain, 10.0) * 0.05;
                col += vec3(fiber * 0.85, fiber * 0.16, fiber * 0.20);

                return clamp(col, 0.0, 1.0);
            }

            vec3 shake(float t) {
                vec3 v = vec3(3.0, 3.0, 2.0);
                vec3 baseShake = .015 * v * sin(.5 * t * v + cos(.2 * t)) + vec3(0.0, .025 * sin(t), 0.0);
                float shakeCap = min(uChaos, 0.36);
                float shakeCycle = fract(t * 0.31);
                float shakePulse = smoothstep(0.015, 0.03, shakeCycle) * (1.0 - smoothstep(0.045, 0.075, shakeCycle));
                vec3 violentShake = vec3(
                    sin(t * 37.0) + sin(t * 91.0) * 0.5,
                    cos(t * 43.0) + sin(t * 67.0) * 0.5,
                    sin(t * 53.0)
                ) * shakeCap * shakeCap * 0.022 * shakePulse;
                return baseShake + violentShake;
            }

            // 鍋跺彂鏁呴殰鐗规晥锛氫笉鏄父椹伙紝鍙湪闅忔満鐭剦鍐查噷鍑虹幇
            float rand(float seed){
                return fract(sin(seed * 12.9898) * 43758.5453);
            }

            float glitchBurst(float t) {
                float rate = mix(1.5, 5.0, uChaos);
                float slot = floor(t * rate);
                float local = fract(t * rate);
                float active = step(mix(0.86, 0.68, uChaos), rand(slot + 13.7));
                float pulse = smoothstep(0.02, 0.07, local) * (1.0 - smoothstep(0.12, 0.44, local));
                float pressure = uChaos * (0.015 + 0.05 * rand(slot + 71.2));
                return clamp(active * pulse * 0.24 + pressure * uChaos, 0.0, 0.28);
            }

            vec2 glitchDisplace(vec2 fragCoord, float strength, float seed) {
                float bandH = mix(8.0, 42.0, rand(seed + 2.0));
                float band = floor(fragCoord.y / bandH);
                float bandNoise = rand(band * 17.13 + seed * 3.71);
                float tear = step(0.64, bandNoise);
                float xShift = (rand(band * 9.17 + seed) - 0.5) * 30.0 * tear * strength;
                float yShift = (rand(band * 5.31 + seed + 9.0) - 0.5) * 1.2 * strength;
                return vec2(xShift, yShift);
            }

            vec3 glitchInterlace(vec2 fragCoord, vec3 col, float strength) {
                float scan = step(0.5, mod(floor(fragCoord.y), 3.0));
                float flicker = 0.78 + sin(iTime * 42.0) * 0.10 + rand(floor(iTime * 30.0)) * 0.10;
                vec3 lineCol = col * flicker + vec3(0.025, 0.04, 0.045) * rand(floor(fragCoord.y) + iTime);
                return mix(col, lineCol, scan * strength);
            }

            float softRect01(vec2 uv, vec2 center, vec2 halfSize, float feather) {
                vec2 d = abs(uv - center) - halfSize;
                float outside = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                return 1.0 - smoothstep(0.0, feather, outside);
            }

            float character(float n, vec2 p) {
                p = floor(p * vec2(5.0, 5.0));
                if (any(lessThan(p, vec2(0.0))) || any(greaterThan(p, vec2(4.0)))) return 0.0;
                float a = exp2(p.x + 5.0 * p.y);
                return mod(floor(n / a), 2.0);
            }

            float glyphMask(float idx) {
                if(idx < 0.5) return 4325376.0;
                if(idx < 1.5) return 4325508.0;
                if(idx < 2.5) return 31744.0;
                if(idx < 3.5) return 4357252.0;
                if(idx < 4.5) return 1118480.0;
                if(idx < 5.5) return 17043521.0;
                if(idx < 6.5) return 18157905.0;
                if(idx < 7.5) return 11512810.0;
                if(idx < 8.5) return 18415150.0;
                if(idx < 9.5) return 16301615.0;
                if(idx < 10.5) return 31491134.0;
                if(idx < 11.5) return 16303663.0;
                if(idx < 12.5) return 32554047.0;
                if(idx < 13.5) return 1096767.0;
                if(idx < 14.5) return 18415153.0;
                if(idx < 15.5) return 18128177.0;
                if(idx < 16.5) return 18405233.0;
                if(idx < 17.5) return 18667121.0;
                if(idx < 18.5) return 18136623.0;
                if(idx < 19.5) return 16267326.0;
                if(idx < 20.5) return 4329631.0;
                if(idx < 21.5) return 32575775.0;
                if(idx < 22.5) return 15324974.0;
                if(idx < 23.5) return 14815428.0;
                if(idx < 24.5) return 32645678.0;
                if(idx < 25.5) return 16265743.0;
                if(idx < 26.5) return 9415048.0;
                if(idx < 27.5) return 16268351.0;
                if(idx < 28.5) return 15252526.0;
                if(idx < 29.5) return 1118495.0;
                if(idx < 30.5) return 15252014.0;
                if(idx < 31.5) return 15235630.0;
                if(idx < 32.5) return 4207119.0;
                return 27070835.0;
            }

            float asciiBurst(float t) {
                float glitchPulse = glitchBurst(t);
                float safeChaos = min(uChaos, 0.58);

                float rate = mix(1.4, 3.5, safeChaos);
                float slot = floor(t * rate);
                float local = fract(t * rate);
                float active = step(mix(0.62, 0.38, safeChaos), rand(slot + 33.8));
                float pulse = smoothstep(0.02, 0.07, local) * (1.0 - smoothstep(0.14, 0.42, local));

                // 涓昏璺熼殢 glitch锛屽悓鏃朵繚鐣欎竴鐐圭嫭绔嬮棯鐜帮紝閬垮厤瀹屽叏鏈烘鍚屾
                return clamp(max(glitchPulse * 0.34, active * pulse * 0.24) + safeChaos * 0.42, 0.0, 0.56);
            }

            vec3 applyWorldAscii(vec3 baseCol, vec3 hitP, vec3 n, float burst) {
                if(burst < 0.001) return baseCol;
                float safeBurst = min(burst, 0.56);

                vec2 surfUV;
                float gridScale;
                float surfaceSeed;

                if(abs(n.y) > 0.9) {
                    surfUV = hitP.xz;
                    gridScale = hitP.y < 10.0 ? 2.45 : 2.05;
                    surfaceSeed = hitP.y < 10.0 ? 11.0 : 37.0;
                } else if(abs(n.x) > 0.5) {
                    surfUV = hitP.zy;
                    gridScale = 1.95;
                    surfaceSeed = n.x > 0.0 ? 61.0 : 73.0;
                } else {
                    surfUV = hitP.xy;
                    gridScale = 1.95;
                    surfaceSeed = n.z > 0.0 ? 89.0 : 97.0;
                }

                float pulseId = floor(iTime * 1.8);
                vec2 drift = vec2(
                    rand(pulseId + surfaceSeed) * 26.0,
                    rand(pulseId * 2.1 + surfaceSeed) * 26.0
                );

                float blobA = fbm(surfUV * 0.10 + drift);
                float blobB = fbm(surfUV * 0.23 - drift * 0.37 + vec2(surfaceSeed));
                float blobC = fbm(surfUV * 0.47 + drift * 0.11);
                float organic = blobA * 0.62 + blobB * 0.28 + blobC * 0.10;
                float patchMask = smoothstep(0.46, 0.62, organic);

                float breakup = hash21(floor(surfUV * 0.85) + vec2(pulseId * 0.31, surfaceSeed));
                patchMask *= smoothstep(0.08, 0.34, breakup + organic * 0.58);
                if(patchMask < 0.01) return baseCol;

                vec2 gridP = surfUV * gridScale;
                vec2 cell = floor(gridP);
                vec2 local = fract(gridP);
                local.y = 1.0 - local.y;

                float coverageGate = step(0.27, hash21(cell + vec2(pulseId * 0.19 + surfaceSeed, pulseId * 0.31)));
                float activeMask = patchMask * coverageGate * safeBurst;
                if(activeMask < 0.001) return baseCol;

                float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
                float variation = hash21(cell * 0.73 + vec2(4.3 + surfaceSeed, pulseId * 0.17));

                // 闅忔満鏁板瓧 / 瀛楁瘝 / 绗﹀彿
                float glyphIndex = floor(rand(dot(cell, vec2(12.7, 31.3)) + pulseId * 5.19 + surfaceSeed) * 34.0);
                float glyph = glyphMask(glyphIndex);
                float ink = character(glyph, local);

                vec3 codeGreen = vec3(0.035, 0.68, 0.20);
                float flicker = 0.80 + 0.18 * rand(pulseId * 9.0 + floor(cell.x * 3.0 + cell.y * 5.0) + surfaceSeed);
                float glowStrength = (0.58 + 0.22 * variation + 0.10 * lum) * flicker;

                // 閫忔槑搴曪細鍙彔鍔犲瓧绗︾瑪鐢伙紝闈炲瓧绗﹀尯鍩熶繚鐣欏師濮嬪 / 鍦?/ 澶╄姳鏉愯川
                vec3 glyphCol = codeGreen * glowStrength;
                vec3 result = baseCol + glyphCol * ink * activeMask * 1.05;
                result = mix(result, glyphCol, ink * activeMask * 0.08);

                return result;
            }

            float map(vec3 p) {
                vec2 q = mod(p.xz + 20.0, 40.0) - 20.0;
                float dRoom = 19.0 - max(abs(q.x), abs(q.y)); 
                float dDoor = 8.0 - min(abs(q.x), abs(q.y)); 
                float dXZ = max(dRoom, dDoor);
                float dY = min(p.y, 20.0 - p.y);
                return min(dXZ, dY);
            }

            vec3 getNormal(vec3 p) {
                vec2 e = vec2(0.05, 0.0);
                return normalize(vec3(
                    map(p + e.xyy) - map(p - e.xyy),
                    map(p + e.yxy) - map(p - e.yxy),
                    map(p + e.yyx) - map(p - e.yyx)
                ));
            }

            vec4 renderScene(vec2 I, float asciiStrength) {
                vec2 uv = (I + I - iResolution.xy) / iResolution.y;
                vec3 col = vec3(0.0);
                
                float travelX = uPan.x;
                float travelZ = uTravelZ;
                
                vec3 camP = vec3(travelX, 9.0 + uPan.y, travelZ) + shake(iTime);
                vec3 camV = normalize(vec3(uv, 0.8));
                
                camV.yz *= rot(uPan.y * 0.035);
                camV.xz *= rot(uPan.x * -0.025);

                camV.zx *= rot(sin(iTime * 0.5) * 0.15);
                camV.xy *= rot(0.05);
                
                float t = 0.0;
                float glow = 0.0; 
                vec3 hitP = camP;
                
                for(int i = 0; i < 150; i++) {
                    float d = map(hitP);
                    glow += exp(-d * 3.0) * 0.018; 
                    if(d < 0.01) break; 
                    t += d * 0.9;       
                    hitP = camP + camV * t;
                    if(t > 250.0) break; 
                }
                
                if(t < 250.0) {
                    vec3 n = getNormal(hitP);
                    bool isWall = false;
                    if(abs(n.y) > 0.9) {
                        if(hitP.y < 10.0) col = carpet(hitP.xz);
                        else col = ceiling(hitP.xz);
                    } else {
                        col = wallMetal(hitP, n, camP);
                        col = wallImages(col, hitP, n);
                        isWall = true;
                    }
                    
                    if(!isWall) {
                        float diff = max(0.0, dot(n, normalize(camP - hitP)));
                        col *= 0.65 + 0.35 * diff; 
                    }
                    float ao = clamp(map(hitP + n * 2.0) / 2.0, 0.0, 1.0);
                    col *= 0.70 + 0.30 * ao;
                    col = applyWorldAscii(col, hitP, n, asciiStrength);
                } else {
                    col = vec3(1.0);
                }
                
                vec3 fogColor = vec3(0.58, 0.60, 0.61); 
                float fogDistance = exp(-t * 0.004); 
                col = mix(fogColor, col, fogDistance);
                
                vec3 dreamBloomColor = vec3(1.0, 0.99, 1.0);
                col += dreamBloomColor * glow * 0.6; 
                float centerGlow = pow(max(0.0, 1.0 - length(uv * 0.6)), 2.2);
                col += vec3(1.0) * centerGlow * 0.18; 
                float atmosphere = exp(-t * 0.008); 
                col += vec3(0.05, 0.05, 0.06) * (1.0 - atmosphere);
                
                col *= 1.1; 
                col = smoothstep(0.0, 1.25, col);
                col *= 1.0 - 0.20 * dot(uv, uv); 

                return vec4(col, 1.0);
            }

            void mainImage(out vec4 O, vec2 I) {
                float strength = glitchBurst(iTime);
                float asciiStrength = asciiBurst(iTime);
                float panic = smoothstep(0.0, 1.0, uFinalPanic);
                vec3 col;

                if(strength > 0.001 || panic > 0.001) {
                    float seed = floor(iTime * 18.0);
                    vec2 baseShift = glitchDisplace(I, strength, seed);
                    vec2 chaosShake = vec2(sin(iTime * 41.0), cos(iTime * 33.0)) * (uChaos * 0.45 + panic * 0.22);
                    vec2 chroma = vec2(0.12 + 0.35 * strength + 0.32 * uChaos + panic * 1.15, 0.0);

                    vec4 redPass = renderScene(I + baseShift + chroma + chaosShake, asciiStrength);
                    vec4 greenPass = renderScene(I - baseShift * 0.08 - chaosShake * 0.08, asciiStrength);
                    vec4 bluePass = renderScene(I + baseShift * 0.16 - chroma + chaosShake * 0.12, asciiStrength);

                    col = vec3(redPass.r, greenPass.g, bluePass.b);
                    col = glitchInterlace(I, col, max(strength, panic * 0.34));

                    float flash = step(0.86, rand(seed + floor(I.y * 0.04))) * strength;
                    col += vec3(0.06, 0.10, 0.11) * flash;
                } else {
                    col = renderScene(I, asciiStrength).rgb;
                }

                vec2 panicUv = (I - 0.5 * iResolution.xy) / iResolution.y;
                float centerPulse = pow(max(0.0, 1.0 - length(panicUv * 1.35)), 2.2);
                float edgeHeat = smoothstep(0.10, 1.0, length(panicUv));
                col += vec3(0.42, 0.025, 0.015) * panic * centerPulse;
                col += vec3(0.20, 0.0, 0.0) * panic * edgeHeat * 0.42;

                O = vec4(clamp(col, 0.0, 1.0), 1.0);
            }

            void main() {
                mainImage(gl_FragColor, gl_FragCoord.xy);
            }
        `;

        function compileShader(gl, source, type) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('鐫€鑹插櫒缂栬瘧澶辫触: ' + gl.getShaderInfoLog(shader));
                return null;
            }
            return shader;
        }

        const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        gl.useProgram(program);

        const vertices = new Float32Array([
            -1.0, -1.0,  1.0, -1.0,  -1.0,  1.0,
            -1.0,  1.0,  1.0, -1.0,   1.0,  1.0
        ]);

        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const aPosition = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

        const uResolution = gl.getUniformLocation(program, 'iResolution');
        const uTime = gl.getUniformLocation(program, 'iTime');
        const uTravelZLoc = gl.getUniformLocation(program, 'uTravelZ');
        const uPanLoc = gl.getUniformLocation(program, 'uPan');
        const uChaosLoc = gl.getUniformLocation(program, 'uChaos');
        const uFinalPanicLoc = gl.getUniformLocation(program, 'uFinalPanic');

        function loadTexture(src, textureUnit, uniformName) {
            const texture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0 + textureUnit);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

            const image = new Image();
            image.onload = () => {
                gl.activeTexture(gl.TEXTURE0 + textureUnit);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            };
            image.src = src;
            gl.uniform1i(gl.getUniformLocation(program, uniformName), textureUnit);
        }

        loadTexture('logo.webp', 0, 'uLogo');
        loadTexture('1.jpg', 1, 'uImage1');
        loadTexture('2.jpg', 2, 'uImage2');
        loadTexture('3.jpg', 3, 'uImage3');
        loadTexture('4.jpg', 4, 'uImage4');
        loadTexture('5.jpg', 5, 'uImage5');

        function createCenterPortalShader() {
            const portalCanvas = document.getElementById('portal-canvas');
            if (!portalCanvas) return null;

            const portalGl = portalCanvas.getContext('webgl', {
                alpha: true,
                antialias: true,
                premultipliedAlpha: false,
                preserveDrawingBuffer: false,
                powerPreference: 'high-performance'
            });

            if (!portalGl) {
                console.warn('Center portal WebGL effect is unavailable in this browser.');
                return null;
            }

            const portalFsSource = `
                precision highp float;

                uniform vec3 iResolution;
                uniform float iTime;

                vec3 palette(float t) {
                    float pulse = 0.5 + 0.5 * cos(6.28318 * (t * 0.42 + 0.08));
                    vec3 deepRed = vec3(0.12, 0.0, 0.005);
                    vec3 darkBlood = vec3(0.40, 0.0, 0.014);
                    vec3 emberRed = vec3(0.58, 0.003, 0.014);
                    return mix(deepRed, darkBlood, pulse) + emberRed * pow(pulse, 4.0) * 0.24;
                }

                void mainImage(out vec4 fragColor, in vec2 fragCoord) {
                    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
                    vec2 uv0 = uv;
                    vec3 finalColor = vec3(0.0);

                    float segments = 127.8;
                    float angle = 5.0 / segments;

                    float r = length(uv);
                    float theta = atan(uv.y, uv.x);
                    theta = abs(mod(theta, angle) - angle * 0.5);
                    theta += iTime * 0.1;
                    uv = r * vec2(cos(theta), sin(theta));

                    for (float i = 5.3; i < 5.9; i += 0.8) {
                        uv = fract(uv * 2.1) - 0.5;
                        float d = length(uv) * exp(-r);
                        vec3 col = palette(length(uv0) + i * 0.1 + iTime * 0.2);

                        d = sin(d * 15.0 + iTime) / 10.0;
                        d = abs(d);
                        d = pow(0.005 / max(d, 0.0001), 1.2);

                        finalColor += col * d;
                    }

                    float coreGlow = exp(-dot(uv0, uv0) * 2.8);
                    finalColor = finalColor * 3.85 + vec3(0.32, 0.0, 0.009) * coreGlow * 0.22;
                    finalColor.gb *= 0.18;

                    float vignette = 1.0 - smoothstep(0.76, 1.24, length(uv0));
                    float alpha = clamp(length(finalColor) * 0.88 + coreGlow * 0.16, 0.0, 0.90) * vignette;
                    fragColor = vec4(finalColor * vignette, alpha);
                }

                void main() {
                    mainImage(gl_FragColor, gl_FragCoord.xy);
                }
            `;

            const portalVertexShader = compileShader(portalGl, vsSource, portalGl.VERTEX_SHADER);
            const portalFragmentShader = compileShader(portalGl, portalFsSource, portalGl.FRAGMENT_SHADER);
            if (!portalVertexShader || !portalFragmentShader) return null;

            const portalProgram = portalGl.createProgram();
            portalGl.attachShader(portalProgram, portalVertexShader);
            portalGl.attachShader(portalProgram, portalFragmentShader);
            portalGl.linkProgram(portalProgram);

            if (!portalGl.getProgramParameter(portalProgram, portalGl.LINK_STATUS)) {
                console.error('Center portal shader link failed: ' + portalGl.getProgramInfoLog(portalProgram));
                return null;
            }

            const portalBuffer = portalGl.createBuffer();
            portalGl.bindBuffer(portalGl.ARRAY_BUFFER, portalBuffer);
            portalGl.bufferData(portalGl.ARRAY_BUFFER, vertices, portalGl.STATIC_DRAW);

            const portalPosition = portalGl.getAttribLocation(portalProgram, 'aPosition');
            const portalResolution = portalGl.getUniformLocation(portalProgram, 'iResolution');
            const portalTime = portalGl.getUniformLocation(portalProgram, 'iTime');

            portalGl.enable(portalGl.BLEND);
            portalGl.blendFunc(portalGl.SRC_ALPHA, portalGl.ONE);

            function resize() {
                const dpr = Math.min(window.devicePixelRatio || 1, APP_CONFIG.maxDevicePixelRatio);
                const rect = portalCanvas.getBoundingClientRect();
                portalCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
                portalCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
                portalGl.viewport(0, 0, portalCanvas.width, portalCanvas.height);
            }

            function render(time) {
                portalGl.useProgram(portalProgram);
                portalGl.bindBuffer(portalGl.ARRAY_BUFFER, portalBuffer);
                portalGl.enableVertexAttribArray(portalPosition);
                portalGl.vertexAttribPointer(portalPosition, 2, portalGl.FLOAT, false, 0, 0);
                portalGl.clearColor(0, 0, 0, 0);
                portalGl.clear(portalGl.COLOR_BUFFER_BIT);
                portalGl.uniform3f(portalResolution, portalCanvas.width, portalCanvas.height, 1.0);
                portalGl.uniform1f(portalTime, time);
                portalGl.drawArrays(portalGl.TRIANGLES, 0, 6);
            }

            resize();
            return { resize, render };
        }

        const centerPortalShader = createCenterPortalShader();

        const countdownWarningCanvas = document.getElementById('countdown-warning-canvas');
        const countdownWarningCtx = countdownWarningCanvas ? countdownWarningCanvas.getContext('2d') : null;

        function drawCountdownWarningIcon() {
            if (!countdownWarningCanvas || !countdownWarningCtx) return;

            const dpr = Math.min(window.devicePixelRatio || 1, APP_CONFIG.maxDevicePixelRatio);
            const rect = countdownWarningCanvas.getBoundingClientRect();
            const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height) * dpr));

            countdownWarningCanvas.width = size;
            countdownWarningCanvas.height = size;

            const ctx = countdownWarningCtx;
            ctx.clearRect(0, 0, size, size);
            ctx.save();
            ctx.scale(size / 240, size / 240);
            ctx.translate(120, 128);

            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(143, 6, 22, 0.96)';
            ctx.fillStyle = 'rgba(143, 6, 22, 0.96)';
            ctx.shadowColor = 'rgba(143, 6, 22, 0.62)';
            ctx.shadowBlur = 14;

            ctx.beginPath();
            ctx.moveTo(0, -102);
            ctx.lineTo(102, 76);
            ctx.lineTo(-102, 76);
            ctx.closePath();
            ctx.lineWidth = 15;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, -26);
            ctx.lineTo(0, 24);
            ctx.lineWidth = 11;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 48, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(143, 6, 22, 0.46)';
            ctx.fillStyle = 'rgba(143, 6, 22, 0.46)';
            ctx.lineWidth = 3;

            ctx.beginPath();
            ctx.moveTo(0, -102);
            ctx.lineTo(102, 76);
            ctx.lineTo(-102, 76);
            ctx.closePath();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, -26);
            ctx.lineTo(0, 24);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 48, 2.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        drawCountdownWarningIcon();

        // ================= 寮€濮嬬‘璁?UI + 闊抽鎾斁 =================
        const startOverlay = document.getElementById('start-overlay');
        const startConfirmBtn = document.getElementById('start-confirm-btn');
        const systemAudio = document.getElementById('system-audio');
        const glitchOverlay = document.getElementById('glitch-overlay');
        const corruptStream = document.getElementById('corrupt-stream');
        const errorStack = document.getElementById('error-stack');
        const errorPopups = document.getElementById('error-popups');
        const countdownHud = document.getElementById('countdown-hud');
        const countdownTime = document.getElementById('countdown-time');
        const countdownStatus = document.getElementById('countdown-status');
        const endingScreen = document.getElementById('ending-screen');
        const endingModal = document.getElementById('ending-modal');
        const endingModalLine = document.getElementById('ending-modal-line');
        let audioDuration = 0;
        let chaosStrength = 0;
        let lastOverlayUpdate = 0;
        let lastLogTypeTime = 0;
        let logLineIndex = 0;
        let logCharIndex = 0;
        let typedLogText = '';
        let logPanelStates = [];
        let lastPanelTypeTime = 0;
        let lastChaosDomUpdate = 0;
        let endingMessageTimers = [];
        let endingMessageRunId = 0;
        let lastCountdownVisualUpdate = 0;
        let lastCountdownCheck = 0;
        let lastCountdownLabel = '';
        let lastCountdownCritical = false;
        let finalPanicStrength = 0;
        let lastFinalPanicCssValue = -1;
        const FINAL_PANIC_DURATION = 15;
        const COUNTDOWN_WARNING_DURATION = 5;

        const endingMessageLines = [
            'made系统已终止，感谢您的访问',
            '祝您体验愉快，made系统期待与您的再会'
        ];

        const corruptTokens = [
            '0xDEAD', 'ERR_PTR', 'NULL', 'MADE_SYS', 'ACCESS_DENIED', 'SYNC_LOST',
            '####', '@@@', 'NaN', 'void', 'seg:13', 'panic()', 'E_AUDIO_HALF',
            'memory_leak', '鏉冮檺寮傚父', '閫氶亾鎹熷潖', '浠诲姟鍥炴粴澶辫触', '绂诲紑纭瓒呮椂'
        ];

        const errorMessages = [
            'FATAL: spatial renderer checksum mismatch',
            'ERROR: gesture stream desynchronized',
            'WARN: corridor depth exceeds permitted range',
            'EXCEPTION: audio midpoint trigger escalated',
            'SYSTEM: MADE exit protocol refused',
            'STACK: renderScene -> wallImages -> applyWorldAscii',
            'ASSERT: user.confirmed == true && exit.allowed == false',
            'IO: corrupted packet received from unknown room'
        ];

        const systemLogMessages = [
            'kernel: watchdog tick missed, retrying',
            'syslog: process made.exit blocked by policy',
            'daemon: room-index cache invalidated',
            'renderer: frame anomaly recorded',
            'audio: duration map locked to metadata',
            'handtrack: input stream unstable',
            'surface: green-code overlay budget capped',
            'route: fallback corridor opened'
        ];

        const crashLogTemplates = [
            '1432 WARN::  clock leap detected in housekeeper',
            '8012 ERROR:: heap allocation cycle failed',
            '8012 FATAL:: out of memory threshold breached',
            '0000 SYS::   dumping core memory to sys_dump.hprof',
            '0000 SYS::   sigsegv termination signal received',
            '0000 FATAL:: system halt',
            '9311 ERROR:: renderer command buffer rejected',
            '7704 WARN::  invalid room pointer dereferenced',
            '2209 ERROR:: stack overflow while resolving exit route',
            '0417 SYS::   writing last known corridor state',
            '5510 FATAL:: access violation in made.kernel',
            '0000 SYS::   emergency shutdown sequence armed'
        ];

        const logBlockTemplates = [
`java.lang.OutOfMemoryError: Java heap space
  at java.base/java.util.Arrays.copyOf(Arrays.java:3537)
  at java.base/java.lang.AbstractStringBuilder.append(AbstractStringBuilder.java:582)
  at java.base/java.lang.StringBuilder.append(StringBuilder.java:173)
  at c.e.p.u.DataProcessor.processLargeReport(DataProcessor.java:142)
  at c.e.p.c.ReportController.exportData(ReportController.java:55)
  ... 35 common frames omitted`,
`[07-08 17:19:15] [FATAL] [thrd-5 ] [Sys ] [SpringApp ] - [Crash: OOM Java heap space]
[07-08 17:19:15] [INFO ] [hook-1 ] [Sys ] [Runtime   ] - [Dumping heap to java_pid14320.hprof]
[07-08 17:19:27] [INFO ] [hook-1 ] [Sys ] [Runtime   ] - [Heap dump created: 1024MB in 12.4s]`,
`[Tx] |||||||||| 99%
[Rx] |||||||... 72%
[Tx] |||||||||| 98%
[Rx] |||....... 30%
[Tx] |||||||||| 99%
[Rx] |......... 10%
[!] WARN: SIG_WEAK
[Tx] |||||||||| 99%
[Rx] .......... 00%
[Tx] .......... 00%
[X] ERR:  LINK_LOST
[X] ERR:  NO_SIGNAL
[!] SYS:  RECONNECT
[-] CHK:  PORT_01
[-] CHK:  PORT_02
[X] FATAL: ISOLATED`,
`ERROR :: SPATIAL RENDERER CHECKSUM MISMATCH
[ MODULE: RENDER_ENGINE ] [ STATUS: OFFLINE ] [ THREAD: 0x8F9A ]

> 17:27:58.001 - loading geometry data.......... [ OK ]
> 17:27:58.045 - compiling shaders.............. [ OK ]
> 17:27:58.112 - allocating VRAM................ [ WARN ] - 98% usage
> 17:27:58.405 - mapping textures............... [ FAIL ] - overflow
> 17:27:58.550 - gesture stream desynchronized.. [ ERR! ]

[!] EMERGENCY ABORT INITIATED. FLUSHING MEMORY TO DISK.`,
`[2026-07-08 17:27:58] [FATAL] [TID: a1b2c3d4] [mod: payment_gateway]
Failed to process transaction stream. Upstream unresponsive.
>>> CONTEXT_DUMP:
{
  "err_code": "ERR_SVC_TIMEOUT",
  "retries": 3,
  "payload": {
    "client_ip": "192.168.4.15",
    "action": "auth_token_verify",
    "status": "DROPPED"
  },
  "stack_trace": "java.net.SocketTimeoutException: Read timed out\\n  at java.net.SocketInputStream.read(Native Method)"
}
>>> SYSTEM HALTED.`,
`--- INTRUSION DETECTION SYSTEM (IDS) ---
[INBOUND] TCP 192.168.0.44:443 -> 10.0.0.1:22
[STATE]   SYN_FLOOD DETECTED (50,000 p/s)
[ACTION]  DROP PACKET (Rule #044: Strict)
[CRIT]    Multiple root authorization failures.
[CRIT]    *** SYSTEM BREACH COMPROMISE ***
[!]       Admin terminal hijacked. Lockout engaged.`,
`TELEMETRY LINK :::: ESTABLISHED
AERO_DYNAMICS  :::: NOMINAL
THRUSTER_PORT  :::: ERR_VIBRATION (0.44g)
THRUSTER_STBD  :::: OFFLINE
---------------------------------------
ALARM: Asymmetric thrust detected.
GYRO_SPIN: +45.2 deg/sec -> WARNING
AUTO_PILOT: DISENGAGED.
MANUAL OVERRIDE REQUIRED IMMEDIATELY.`,
`[892.42] 1432 WARN::  clock leap detected in housekeeper
[894.15] 8012 ERROR:: heap allocation cycle failed
[894.18] 8012 FATAL:: out of memory threshold breached
[894.20] 0000 SYS::   dumping core memory to sys_dump.hprof
[894.88] 0000 SYS::   sigsegv termination signal received
[894.89] 0000 FATAL:: system halt`,
`[903.02] 4421 WARN::  gc pause exceeded frame budget
[903.44] 4421 ERROR:: nursery promotion failed
[903.47] 4421 FATAL:: heap survivor space exhausted
[903.51] 0000 SYS::   serializing crash segment 07/12
[904.18] 0000 SYS::   kernel panic latch armed
[904.19] 0000 FATAL:: runtime terminated`,
`[916.66] 1432 WARN::  monotonic clock rollback detected
[916.91] 6120 ERROR:: buffer allocator returned null
[916.93] 6120 FATAL:: object graph traversal aborted
[916.96] 0000 SYS::   dumping core memory to sys_dump.hprof
[917.24] 0000 SYS::   flushing telemetry ring buffer
[917.25] 0000 FATAL:: system halt`,
`[927.10] 7001 WARN::  thermal governor missed heartbeat
[927.39] 7001 ERROR:: async queue capacity breached
[927.44] 8020 ERROR:: worker pool starvation detected
[927.48] 8020 FATAL:: task scheduler isolated
[928.02] 0000 SYS::   writing fail-safe checkpoint
[928.03] 0000 FATAL:: emergency stop`,
`panic: index corridor[2048] outside mapped volume

goroutine 1142 [running]:
made/render.(*Grid).ResolveExit(0xc00044d800, 0x8ff)
        /srv/made/render/grid.go:221 +0x16d
made/input.(*GestureBus).Commit(0xc000118080)
        /srv/made/input/bus.go:88 +0x93
runtime.goexit()
        /usr/local/go/src/runtime/asm_amd64.s:1695 +0x1`,
`ORA-00600: internal error code, arguments: [kghstack_underflow], [0x8F9A], [], []
ORA-04030: out of process memory when trying to allocate 65536 bytes
Process ID: 14320
Session ID: 381 Serial number: 991
Incident written to: diag/rdbms/made/trace/made_ora_14320.trc`,
`[KERNEL] BUG: unable to handle page fault at 00000000DEAD0000
[KERNEL] RIP: 0010:made_room_resolve+0x2a7/0x4f0
[KERNEL] RSP: 0018:ffffb7d4824d7c60 EFLAGS: 00010246
[KERNEL] Call Trace:
[KERNEL]  renderer_commit_frame+0x91/0x180
[KERNEL]  gesture_tick+0x54/0xb0
[KERNEL] ---[ end trace 8f9a0017 ]---`,
`[SECURITY] token replay detected from 172.16.8.44
[SECURITY] nonce window exhausted: user=root session=0x91FF
[AUTH]     challenge response mismatch
[AUTH]     privilege escalation attempt blocked
[FATAL]    root shell spawned outside trust boundary
[LOCK]     console frozen pending forensic dump`,
`PID  PPID STAT %MEM COMMAND
8012 1432 R+   98.7 made-render --room=exit
8013 1432 D    71.2 heap-writer --dump=sys_dump.hprof
8014 0001 Z    00.0 gesture-bus <defunct>

oom-kill: constraint=CONSTRAINT_NONE, task=made-render, pid=8012
Out of memory: Killed process 8012 (made-render) total-vm:4194304kB`,
`[BUS-A] voltage sag detected: 7.2V -> 3.1V
[BUS-B] packet checksum failed on frame 88402
[CTRL ] retry window exceeded after 4096 attempts
[NAV  ] route solver returned NaN coordinate
[SAFE ] sealing control surface channels
[FATAL] navigation core unavailable`
        ];
        const preferredCrashBlock = logBlockTemplates[7];
        const weightedLogBlockTemplates = [
            logBlockTemplates[0],
            logBlockTemplates[2],
            logBlockTemplates[5],
            logBlockTemplates[6],
            logBlockTemplates[3],
            logBlockTemplates[4],
            `[891.07] 2201 WARN::  scheduler drift exceeded 180ms
[891.42] 2201 ERROR:: watchdog callback missed
[891.66] 8088 FATAL:: memory guard page corrupted
[892.02] 0000 SYS::   forcing emergency heap compact
[892.71] 0000 FATAL:: unrecoverable runtime state`,
            logBlockTemplates[13],
            logBlockTemplates[14],
            logBlockTemplates[1],
            logBlockTemplates[15],
            logBlockTemplates[11],
`[900.12] 1432 WARN::  housekeeper thread blocked
[900.38] 8012 ERROR:: object pool saturation
[900.40] 8012 FATAL:: allocation retry limit exceeded
[900.44] 0000 SYS::   dumping core memory to sys_dump.hprof
[900.91] 0000 FATAL:: system halt`,
            logBlockTemplates[12],
            logBlockTemplates[16],
            logBlockTemplates[8],
            logBlockTemplates[9],
            logBlockTemplates[10],
            preferredCrashBlock,
            preferredCrashBlock,
            preferredCrashBlock,
            ...logBlockTemplates
        ];
        let nextLogTemplateIndex = 0;

        function clamp01(value) {
            return Math.max(0, Math.min(value, 1));
        }

        function smoothstepAudio(edge0, edge1, value) {
            const x = clamp01((value - edge0) / (edge1 - edge0));
            return x * x * (3 - 2 * x);
        }

        function getAudioChaosStrength() {
            const duration = Number.isFinite(systemAudio.duration) ? systemAudio.duration : audioDuration;
            if (systemAudio.ended) return 1;
            if (!duration || duration <= 0) return 0;

            const raw = systemAudio.currentTime / Math.max(duration, 0.001);
            return smoothstepAudio(0, 1, raw);
        }

        function getFinalPanicStrength() {
            const duration = Number.isFinite(systemAudio.duration) ? systemAudio.duration : audioDuration;
            if (!duration || duration <= 0) return 0;
            if (systemAudio.paused) return 0;
            if (systemAudio.ended) return 1;

            const remaining = Math.max(0, duration - systemAudio.currentTime);
            return smoothstepAudio(0, 1, clamp01(1 - remaining / FINAL_PANIC_DURATION));
        }

        function updateFinalPanic() {
            finalPanicStrength += (getFinalPanicStrength() - finalPanicStrength) * 0.12;
            const cssValue = Math.round(finalPanicStrength * 1000) / 1000;
            if (Math.abs(cssValue - lastFinalPanicCssValue) >= 0.004) {
                document.documentElement.style.setProperty('--final-panic', String(cssValue));
                lastFinalPanicCssValue = cssValue;
            }
        }

        function getCountdownWarningStrength() {
            const duration = Number.isFinite(systemAudio.duration) ? systemAudio.duration : audioDuration;
            if (!duration || duration <= 0 || systemAudio.paused || systemAudio.ended) return 0;

            const remaining = Math.max(0, duration - systemAudio.currentTime);
            if (remaining > COUNTDOWN_WARNING_DURATION) return 0;

            const pressure = clamp01(1 - remaining / COUNTDOWN_WARNING_DURATION);
            const pulse = 0.88 + 0.12 * Math.sin(performance.now() * 0.018);
            return (0.82 + smoothstepAudio(0, 1, pressure) * 0.18) * pulse;
        }

        function formatCountdownTime(seconds) {
            const safeSeconds = Math.max(0, Math.ceil(seconds));
            const minutes = Math.floor(safeSeconds / 60);
            const remainingSeconds = safeSeconds % 60;
            return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
        }

        function updateCountdownHud(nowMs = performance.now()) {
            if (!systemAudio.ended && nowMs - lastCountdownCheck < 250) return;
            lastCountdownCheck = nowMs;

            const duration = Number.isFinite(systemAudio.duration) ? systemAudio.duration : audioDuration;
            const hasDuration = duration && duration > 0;
            const isRunning = !systemAudio.paused && !systemAudio.ended;

            if (!hasDuration || (!isRunning && !systemAudio.ended)) {
                countdownHud.classList.remove('is-visible', 'is-critical');
                countdownTime.textContent = '--:--';
                countdownTime.dataset.time = '--:--';
                countdownStatus.textContent = hasDuration ? 'ARMED' : 'SYNCING';
                lastCountdownLabel = '--:--';
                lastCountdownCritical = false;
                return;
            }

            const remaining = systemAudio.ended ? 0 : Math.max(0, duration - systemAudio.currentTime);
            const remainingRatio = clamp01(remaining / duration);
            const label = formatCountdownTime(remaining);
            const isCritical = remainingRatio <= 0.2;

            countdownHud.classList.add('is-visible');
            if (isCritical !== lastCountdownCritical) {
                countdownHud.classList.toggle('is-critical', isCritical);
                countdownStatus.textContent = isCritical ? 'BREACH IMMINENT' : 'AUDIO SYNC';
                lastCountdownCritical = isCritical;
            }
            if (label !== lastCountdownLabel) {
                countdownTime.textContent = label;
                countdownTime.dataset.time = label;
                lastCountdownLabel = label;
            }
        }

        function buildCorruptText(strength) {
            const lineCount = Math.floor(1 + strength * 3);
            const tokenCount = Math.floor(3 + strength * 5);
            const lines = [];

            for (let y = 0; y < lineCount; y++) {
                let line = '';
                for (let x = 0; x < tokenCount; x++) {
                    const token = corruptTokens[Math.floor(Math.random() * corruptTokens.length)];
                    line += token + (Math.random() > 0.72 - strength * 0.25 ? '' : ' ');
                }
                lines.push(line);
            }

            return lines.join('\n');
        }

        function buildErrorText(strength) {
            return typedLogText;
        }

        function updateTypedSystemLog(strength, nowMs) {
            if (nowMs - lastLogTypeTime < 18 + Math.random() * 28) return;

            const line = `[${(systemAudio.currentTime || 0).toFixed(2).padStart(6, '0')}] ${crashLogTemplates[logLineIndex % crashLogTemplates.length]}`;
            const charsThisTick = 4 + Math.floor(Math.random() * 7);
            typedLogText += line.slice(logCharIndex, logCharIndex + charsThisTick);
            logCharIndex += charsThisTick;

            if (logCharIndex >= line.length) {
                typedLogText += '\n';
                logCharIndex = 0;
                logLineIndex += 1;
            }

            const lines = typedLogText.split('\n');
            if (lines.length > 15) {
                typedLogText = lines.slice(-15).join('\n');
            }

            lastLogTypeTime = nowMs;
        }

        function pickLogTemplate() {
            const text = weightedLogBlockTemplates[nextLogTemplateIndex % weightedLogBlockTemplates.length];
            nextLogTemplateIndex += 1 + Math.floor(Math.random() * 2);
            return text;
        }

        const logPanelSlots = [
            { side: 'left', band: 'top' },
            { side: 'left', band: 'middle' },
            { side: 'left', band: 'bottom' },
            { side: 'right', band: 'top' },
            { side: 'right', band: 'middle' },
            { side: 'right', band: 'bottom' }
        ];

        function escapeLogHtml(text) {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function shuffleLogSlots(requiredSide) {
            return logPanelSlots
                .map((slot, slotIndex) => ({ ...slot, slotIndex, order: Math.random() }))
                .filter((slot) => !requiredSide || slot.side === requiredSide)
                .sort((a, b) => a.order - b.order);
        }

        function estimateLogPanelSize(text) {
            const lines = text.split('\n');
            const viewportWidth = Math.max(window.innerWidth || 1280, 1);
            const viewportHeight = Math.max(window.innerHeight || 720, 1);
            const fontPx = Math.max(10, Math.min(viewportWidth * 0.009, 13));
            const isWide = text.length > 360;
            const maxWidthVw = Math.min(isWide ? 42 : 38, ((isWide ? 620 : 520) / viewportWidth) * 100);
            const widthPx = viewportWidth * (maxWidthVw / 100);
            const charsPerVisualLine = Math.max(16, Math.floor((widthPx - 8) / (fontPx * 0.62)));
            const visualLineCount = lines.reduce((count, line) => {
                return count + Math.max(1, Math.ceil(line.length / charsPerVisualLine));
            }, 0);
            const heightPx = visualLineCount * fontPx * 1.34 * 1.18 + 18;

            return {
                width: maxWidthVw,
                height: (heightPx / viewportHeight) * 100
            };
        }

        function doLogRectsOverlap(a, b) {
            const gap = 6;
            return !(
                a.left + a.width + gap <= b.left ||
                b.left + b.width + gap <= a.left ||
                a.top + a.height + gap <= b.top ||
                b.top + b.height + gap <= a.top
            );
        }

        function positionLogSlot(slot, size) {
            const maxLeft = Math.max(1, 99 - size.width);
            const maxTop = Math.max(3, 96 - size.height);
            const centerTop = Math.max(3, Math.min(maxTop, 50 - size.height / 2));
            const sideLeft = slot.side === 'right' ? maxLeft - 4 : 4;
            const bandTop = {
                top: 7,
                middle: centerTop,
                bottom: Math.max(3, maxTop - 4)
            }[slot.band] || centerTop;
            return {
                left: Math.max(1, Math.min(maxLeft, sideLeft + Math.random() * 4 - 2)),
                top: Math.max(3, Math.min(maxTop, bandTop + Math.random() * 5 - 2.5))
            };
        }

        function pickLogPanelSide(index, ignorePanelIndex) {
            const otherPanel = logPanelStates.find((panel, panelIndex) => {
                return panelIndex !== ignorePanelIndex && panel.side;
            });
            if (otherPanel) return otherPanel.side === 'left' ? 'right' : 'left';
            return Math.random() > 0.5 ? 'right' : 'left';
        }

        function pickNonOverlappingLogPosition(text, index, ignorePanelIndex = -1) {
            const size = estimateLogPanelSize(text);
            const side = pickLogPanelSide(index, ignorePanelIndex);
            const existingRects = logPanelStates
                .filter((panel, panelIndex) => panelIndex !== ignorePanelIndex && panel.rect)
                .map((panel) => panel.rect);

            for (let attempt = 0; attempt < 12; attempt++) {
                const slots = shuffleLogSlots(side);
                for (const slot of slots) {
                    const { left, top } = positionLogSlot(slot, size);
                    const rect = { left, top, width: size.width, height: size.height };
                    const overlapCount = existingRects.filter((existing) => doLogRectsOverlap(rect, existing)).length;

                    if (overlapCount === 0) {
                        return { left, top, rect, slotIndex: slot.slotIndex, side };
                    }
                }
            }

            if (existingRects.length < 1) {
                const slot = shuffleLogSlots(side)[0];
                const { left, top } = positionLogSlot(slot, size);
                const rect = { left, top, width: size.width, height: size.height };
                return { left, top, rect, slotIndex: slot.slotIndex, side };
            }

            return null;
        }

        function createLogPanelState(index, nowMs) {
            const text = pickLogTemplate();
            const position = pickNonOverlappingLogPosition(text, index, index);
            if (!position) return null;
            const baseDelay = 3 + Math.random() * 8;
            const isRed = Math.random() < 0.34 || /IDS|BREACH|SECURITY|\[KERNEL\]|INTRUSION|SYN_FLOOD|LOCK/.test(text);
            return {
                text,
                chars: 0,
                completedAt: 0,
                slotIndex: position.slotIndex,
                side: position.side,
                rect: position.rect,
                left: position.left,
                top: position.top,
                width: position.rect.width,
                className: `log-panel${isRed ? ' is-red' : ''}${text.length > 360 ? ' is-wide' : ''}`,
                nextTypeAt: nowMs + Math.random() * 80,
                typeDelayBase: baseDelay,
                burstMax: 5 + Math.floor(Math.random() * 7),
                zIndex: 20 + index
            };
        }

        function ensureLogPanelStates(strength, nowMs) {
            const count = 2;

            while (logPanelStates.length < count) {
                const i = logPanelStates.length;
                const panel = createLogPanelState(i, nowMs);
                if (!panel) break;
                logPanelStates.push(panel);
            }

            if (logPanelStates.length > count) {
                logPanelStates.length = count;
            }

            logPanelStates = logPanelStates.map((panel, index) => {
                const hasFinished = panel.chars >= panel.text.length;
                const hasHeldLongEnough = panel.completedAt && nowMs - panel.completedAt > 1700 + index * 450;
                if (!hasFinished || !hasHeldLongEnough) return panel;
                return createLogPanelState(index, nowMs) || panel;
            });
        }

        function updateLogPanels(strength, nowMs) {
            ensureLogPanelStates(strength, nowMs);
            if (nowMs - lastPanelTypeTime < 4 + Math.random() * 10) return;

            logPanelStates.forEach((panel, index) => {
                if (panel.chars >= panel.text.length) {
                    if (!panel.completedAt) panel.completedAt = nowMs;
                    return;
                }

                if (nowMs < panel.nextTypeAt) return;

                const burst = 1 + Math.floor(Math.random() * panel.burstMax);
                panel.chars = Math.min(panel.text.length, panel.chars + burst);
                panel.nextTypeAt = nowMs + panel.typeDelayBase + Math.random() * 14;
            });

            lastPanelTypeTime = nowMs;
        }

        function buildErrorPopups(strength) {
            let html = '';

            logPanelStates.forEach((panel) => {
                html += `<pre class="${panel.className}" style="left:${panel.left}vw;top:${panel.top}vh;z-index:${panel.zIndex};--log-panel-width:${panel.width}vw;">${escapeLogHtml(panel.text.slice(0, panel.chars))}</pre>`;
            });

            return html;
        }

        function clearChaosEffects() {
            chaosStrength = 0;
            finalPanicStrength = 0;
            lastFinalPanicCssValue = -1;
            document.documentElement.style.setProperty('--final-panic', '0');
            document.documentElement.style.setProperty('--countdown-warning', '0');
            document.documentElement.style.setProperty('--chaos', '0');
            document.body.classList.remove('chaos-active');
            glitchOverlay.style.display = 'none';
            corruptStream.textContent = '';
            errorStack.textContent = '';
            errorPopups.innerHTML = '';
            logPanelStates = [];
            nextLogTemplateIndex = 0;
            lastPanelTypeTime = 0;
        }

        function setEndingMessageTimer(callback, delay) {
            const timer = window.setTimeout(callback, delay);
            endingMessageTimers.push(timer);
            return timer;
        }

        function clearEndingMessageTimers() {
            endingMessageTimers.forEach((timer) => window.clearTimeout(timer));
            endingMessageTimers = [];
            endingMessageRunId += 1;
        }

        function resetEndingMessage() {
            clearEndingMessageTimers();
            endingModal.classList.remove('is-active');
            endingModalLine.classList.remove('is-fading');
            endingModalLine.textContent = '';
        }

        function typeEndingLine(runId, lineIndex) {
            if (runId !== endingMessageRunId || lineIndex >= endingMessageLines.length) return;

            const line = endingMessageLines[lineIndex];
            let charIndex = 0;
            endingModalLine.textContent = '';
            endingModalLine.classList.remove('is-fading');
            endingModal.classList.add('is-active');

            const typeNextChar = () => {
                if (runId !== endingMessageRunId) return;

                if (charIndex < line.length) {
                    endingModalLine.textContent += line[charIndex];
                    charIndex += 1;
                    setEndingMessageTimer(typeNextChar, 54 + Math.random() * 46);
                    return;
                }

                const isLastLine = lineIndex === endingMessageLines.length - 1;
                if (isLastLine) return;

                setEndingMessageTimer(() => {
                    if (runId !== endingMessageRunId) return;
                    endingModalLine.classList.add('is-fading');
                    setEndingMessageTimer(() => typeEndingLine(runId, lineIndex + 1), 330);
                }, 1050);
            };

            typeNextChar();
        }

        function startEndingMessageSequence() {
            resetEndingMessage();
            const runId = endingMessageRunId;
            setEndingMessageTimer(() => {
                if (runId !== endingMessageRunId) return;
                typeEndingLine(runId, 0);
            }, 2500);
        }

        function updateChaosOverlay(nowMs) {
            if (endingScreen.classList.contains('is-visible')) {
                clearChaosEffects();
                return;
            }

            chaosStrength += (getAudioChaosStrength() - chaosStrength) * 0.08;
            const visualStrength = chaosStrength < 0.01 ? 0 : chaosStrength;

            document.documentElement.style.setProperty('--chaos', visualStrength.toFixed(3));
            document.body.classList.toggle('chaos-active', visualStrength > 0.08);
            glitchOverlay.style.display = visualStrength > 0.01 ? 'block' : 'none';

            const interval = APP_CONFIG.performanceMode
                ? (visualStrength > 0.82 ? 620 : Math.max(820, 1350 - visualStrength * 360))
                : (visualStrength > 0.82 ? 360 : Math.max(650, 1100 - visualStrength * 320));
            if (visualStrength > 0.01 && nowMs - lastOverlayUpdate > interval) {
                corruptStream.textContent = buildCorruptText(visualStrength);
                lastOverlayUpdate = nowMs;
            }

            const domInterval = APP_CONFIG.performanceMode
                ? (visualStrength > 0.82 ? 220 : Math.max(280, 520 - visualStrength * 160))
                : 0;
            if (!domInterval || nowMs - lastChaosDomUpdate > domInterval) {
                updateTypedSystemLog(visualStrength, nowMs);
                errorStack.textContent = buildErrorText(visualStrength);
                updateLogPanels(visualStrength, nowMs);
                errorPopups.innerHTML = buildErrorPopups(visualStrength);
                lastChaosDomUpdate = nowMs;
            }
        }

        systemAudio.addEventListener('loadedmetadata', () => {
            audioDuration = Number.isFinite(systemAudio.duration) ? systemAudio.duration : 0;
            updateCountdownHud();
        });

        systemAudio.addEventListener('ended', () => {
            updateCountdownHud();
            clearChaosEffects();
            gl.uniform1f(uChaosLoc, 0);
            gl.uniform1f(uFinalPanicLoc, 0);
            endingScreen.classList.add('is-visible');
            startEndingMessageSequence();
        });

        startConfirmBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            startOverlay.classList.add('is-hidden');
            resetEndingMessage();
            endingScreen.classList.remove('is-visible');

            try {
                systemAudio.currentTime = 0;
                systemAudio.volume = 1.0;
                chaosStrength = 0;
                finalPanicStrength = 0;
                lastFinalPanicCssValue = -1;
                document.documentElement.style.setProperty('--final-panic', '0');
                document.documentElement.style.setProperty('--countdown-warning', '0');
                lastOverlayUpdate = 0;
                lastLogTypeTime = 0;
                logLineIndex = 0;
                logCharIndex = 0;
                typedLogText = '';
                logPanelStates = [];
                nextLogTemplateIndex = 0;
                lastPanelTypeTime = 0;
                corruptStream.textContent = '';
                errorStack.textContent = '';
                errorPopups.innerHTML = '';
                updateCountdownHud();
                await systemAudio.play();
                updateCountdownHud();
            } catch (err) {
                console.warn('Audio playback failed. Please keep audio.MP3 and this HTML file in the same folder, then check browser audio permission.', err);
            }
        });

        // ================= UI 寮€鍏虫帶鍒堕€昏緫 =================
        let isPanelVisible = true;
        const btnToggle = document.getElementById('btn-toggle');
        const controlPanel = document.getElementById('control-panel');

        btnToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            isPanelVisible = !isPanelVisible;
            if (isPanelVisible) {
                controlPanel.classList.remove('collapsed');
                btnToggle.innerText = '隐藏控制';
            } else {
                controlPanel.classList.add('collapsed');
                btnToggle.innerText = '展开控制';
            }

            
        });

        // ================= 浜や簰妯″紡鎺у埗閫昏緫 =================
        let interactionMode = 'mouse'; 
        let gestureCameraStarted = false;
        
        const btnMouse = document.getElementById('btn-mouse');
        const btnGesture = document.getElementById('btn-gesture');
        const gesturePreview = document.getElementById('gesture-preview');
        const gesturePreviewStatus = document.getElementById('gesture-preview-status');

        btnMouse.addEventListener('click', (e) => {
            e.stopPropagation(); 
            interactionMode = 'mouse';
            btnMouse.classList.add('active');
            btnGesture.classList.remove('active');
            gesturePreview.classList.remove('is-visible');
            gesturePreview.setAttribute('aria-hidden', 'true');
            stopGestureCamera();
        });

        btnGesture.addEventListener('click', (e) => {
            e.stopPropagation(); 
            interactionMode = 'gesture';
            btnGesture.classList.add('active');
            btnMouse.classList.remove('active');
            gesturePreview.classList.add('is-visible');
            gesturePreview.setAttribute('aria-hidden', 'false');
            startGestureCamera();
        });

        // ================= 榧犳爣/瑙︽懜/婊氳疆 浜嬩欢浜や簰 =================
        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let isMouseDown = false;
        
        // 鏂板锛氫笓鐢ㄤ簬榧犳爣婊氳疆鍔犻€熺殑鍙橀噺
        let mouseWheelBoost = 0;

        window.addEventListener('mousedown', (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            isMouseDown = true;
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (isMouseDown) {
                mouseX = e.clientX;
                mouseY = e.clientY;
            }
        });

        window.addEventListener('mouseup', () => { isMouseDown = false; });
        window.addEventListener('mouseleave', () => { isMouseDown = false; });
        
        // 婊氳疆浜嬩欢鐩戝惉 (浠呭湪榧犳爣妯″紡涓嬬敓鏁?
        window.addEventListener('wheel', (e) => {
            if (interactionMode === 'mouse') {
                // 鍚戜笂婊氬姩 deltaY 涓鸿礋鏁帮紝鐩稿噺鍒欎负澧炲姞鎺ㄥ姏
                mouseWheelBoost -= e.deltaY * 0.08;
                // 闄愬埗鎺ㄥ姏锛氫笂闄愪负 40 (鏈€楂橀€?锛屼笅闄愪负 -5.0 (鍙互鍒氬ソ鎶垫秷榛樿姝ラ€燂紝瀹炵幇鍒硅溅)
                mouseWheelBoost = Math.max(-5.0, Math.min(mouseWheelBoost, 40.0));
            }
        }, { passive: true });
        
        window.addEventListener('touchstart', (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            isMouseDown = true;
            mouseX = e.touches[0].clientX;
            mouseY = e.touches[0].clientY;
        });
        window.addEventListener('touchmove', (e) => {
            if (isMouseDown) {
                mouseX = e.touches[0].clientX;
                mouseY = e.touches[0].clientY;
            }
        });
        window.addEventListener('touchend', () => { isMouseDown = false; });

        window.addEventListener('dblclick', (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return; 
            
            const docEl = document.documentElement;
            if (!document.fullscreenElement) {
                if (docEl.requestFullscreen) docEl.requestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        });

        function resizeCanvas() {
            const dpr = Math.min(window.devicePixelRatio || 1, APP_CONFIG.maxDevicePixelRatio);
            const scale = Math.max(0.75, Math.min(APP_CONFIG.renderScale, 1));
            const displayWidth = window.innerWidth;
            const displayHeight = window.innerHeight;

            canvas.style.width = `${displayWidth}px`;
            canvas.style.height = `${displayHeight}px`;
            canvas.width = Math.max(1, Math.floor(displayWidth * dpr * scale));
            canvas.height = Math.max(1, Math.floor(displayHeight * dpr * scale));
            gl.viewport(0, 0, canvas.width, canvas.height);
            if (centerPortalShader) centerPortalShader.resize();
            drawCountdownWarningIcon();
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // ================= 鎵嬪娍璇嗗埆閫昏緫 =================
        let isHandVisible = false;
        let isFist = false;
        let handX = 0.5; 
        let handY = 0.5; 

        const videoElement = document.getElementById('gesture-video');
        const gestureSkeletonCanvas = document.getElementById('gesture-skeleton-canvas');
        const gestureSkeletonCtx = gestureSkeletonCanvas.getContext('2d');
        const handConnections = window.HAND_CONNECTIONS || [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [5, 9], [9, 10], [10, 11], [11, 12],
            [9, 13], [13, 14], [14, 15], [15, 16],
            [13, 17], [17, 18], [18, 19], [19, 20],
            [0, 17]
        ];

        function drawHandSkeleton(landmarks) {
            const width = gestureSkeletonCanvas.width;
            const height = gestureSkeletonCanvas.height;
            gestureSkeletonCtx.clearRect(0, 0, width, height);
            if (!landmarks) return;

            gestureSkeletonCtx.lineWidth = 3;
            gestureSkeletonCtx.lineCap = 'round';
            gestureSkeletonCtx.lineJoin = 'round';
            gestureSkeletonCtx.strokeStyle = '#ff1f36';
            gestureSkeletonCtx.shadowColor = 'rgba(255, 0, 36, 0.9)';
            gestureSkeletonCtx.shadowBlur = 8;

            handConnections.forEach(([startIndex, endIndex]) => {
                const start = landmarks[startIndex];
                const end = landmarks[endIndex];
                gestureSkeletonCtx.beginPath();
                gestureSkeletonCtx.moveTo(start.x * width, start.y * height);
                gestureSkeletonCtx.lineTo(end.x * width, end.y * height);
                gestureSkeletonCtx.stroke();
            });

            gestureSkeletonCtx.fillStyle = '#ff3348';
            landmarks.forEach((landmark, index) => {
                gestureSkeletonCtx.beginPath();
                gestureSkeletonCtx.arc(
                    landmark.x * width,
                    landmark.y * height,
                    index === 0 ? 5 : 3.5,
                    0,
                    Math.PI * 2
                );
                gestureSkeletonCtx.fill();
            });
            gestureSkeletonCtx.shadowBlur = 0;
        }

        const hands = new Hands({locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }});
        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });

        hands.onResults((results) => {
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                isHandVisible = true;
                const landmarks = results.multiHandLandmarks[0];
                drawHandSkeleton(landmarks);
                gesturePreviewStatus.classList.add('is-hidden');

                handX = landmarks[9].x;
                handY = landmarks[9].y;

                const wrist = landmarks[0];
                const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
                
                const indexExtended = dist(landmarks[8], wrist) > dist(landmarks[5], wrist);
                const middleExtended = dist(landmarks[12], wrist) > dist(landmarks[9], wrist);
                const ringExtended = dist(landmarks[16], wrist) > dist(landmarks[13], wrist);
                const pinkyExtended = dist(landmarks[20], wrist) > dist(landmarks[17], wrist);

                const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;
                isFist = (extendedCount <= 1);
            } else {
                isHandVisible = false;
                drawHandSkeleton(null);
                gesturePreviewStatus.textContent = '请将手放入画面';
                gesturePreviewStatus.classList.remove('is-hidden');
            }
        });

        const camera = new Camera(videoElement, {
            onFrame: async () => {
                await hands.send({image: videoElement});
            },
            width: 320,
            height: 240
        });

        function startGestureCamera() {
            if (gestureCameraStarted) return;
            gestureCameraStarted = true;
            gesturePreviewStatus.textContent = '正在启动摄像头...';
            gesturePreviewStatus.classList.remove('is-hidden');
            camera.start().catch(err => {
                gestureCameraStarted = false;
                gesturePreviewStatus.textContent = '无法访问摄像头';
                gesturePreviewStatus.classList.remove('is-hidden');
                console.warn("鎽勫儚澶村惎鍔ㄥけ璐?", err);
            });
        }

        function stopGestureCamera() {
            if (!gestureCameraStarted) return;
            camera.stop();
            gestureCameraStarted = false;
            isHandVisible = false;
            drawHandSkeleton(null);
            gesturePreviewStatus.textContent = '正在启动摄像头...';
            gesturePreviewStatus.classList.remove('is-hidden');
        }

        const startTime = Date.now();
        let lastTime = Date.now();
        
        let currentTravelZ = 0;
        let currentPanX = 0;
        let currentPanY = 0;
        let targetPanX = 0;
        let targetPanY = 0;
        
        let currentSpeed = 5.0; 
        let targetSpeed = 5.0;  

        function render() {
            const now = Date.now();
            const dt = (now - lastTime) / 1000.0;
            lastTime = now;
            const currentTime = (now - startTime) / 1000.0;
            updateChaosOverlay(now);
            updateFinalPanic();
            updateCountdownHud();
            document.documentElement.style.setProperty('--countdown-warning', getCountdownWarningStrength().toFixed(3));

            let inputX = 0;
            let inputY = 0;

            if (interactionMode === 'mouse') {
                if (isMouseDown) {
                    // 鎸変綇榧犳爣鎷栨嫿鏃讹紝鍙敼鍙樿閲庢柟鍚戯紙涓嶄富鍔ㄦ彁閫燂級
                    inputX = (mouseX / window.innerWidth - 0.5) * 2.0; 
                    inputY = (0.5 - mouseY / window.innerHeight) * 2.0; 
                } else {
                    // 榧犳爣鏉惧紑鏃讹紝缂撴參鐨勯粯璁ら暅澶村懠鍚告劅
                    inputX = Math.sin(currentTime * 0.4) * 0.2;
                    inputY = 0.0;
                }
                
                // 閫熷害鐢遍粯璁ゅ熀纭€閫熷害(5.0)鍔犱笂婊氳疆甯︽潵鐨勯€熷害(mouseWheelBoost)鍐冲畾
                targetSpeed = 5.0 + mouseWheelBoost; 
                
                mouseWheelBoost += (0 - mouseWheelBoost) * 0.05;
                
            } else if (interactionMode === 'gesture') {
                // 鍒囨崲鍥炰綋鎰熸ā寮忔椂锛屾竻绌洪紶鏍囩殑婊氳疆娈嬪瓨鎺ㄥ姏
                mouseWheelBoost = 0; 
                
                if (isHandVisible) {
                    inputX = (0.5 - handX) * 2.0;  
                    inputY = (0.5 - handY) * 2.0;  
                    targetSpeed = isFist ? 0.0 : 25.0; 
                } else {
                    inputX = Math.sin(currentTime * 0.4) * 0.2;
                    inputY = 0.0;
                    targetSpeed = 5.0; 
                }
            }

            targetPanX = inputX * 45.0;  
            targetPanY = inputY * 20.0;  

            // 閫熷害骞虫粦杩囨浮
            currentSpeed += (targetSpeed - currentSpeed) * 0.08;
            currentTravelZ += currentSpeed * dt;

            currentPanX += (targetPanX - currentPanX) * 0.08;
            currentPanY += (targetPanY - currentPanY) * 0.08;

            gl.uniform3f(uResolution, canvas.width, canvas.height, 1.0);
            gl.uniform1f(uTime, currentTime);
            
            gl.uniform1f(uTravelZLoc, currentTravelZ);
            gl.uniform2f(uPanLoc, currentPanX, currentPanY);
            gl.uniform1f(uChaosLoc, chaosStrength);
            gl.uniform1f(uFinalPanicLoc, finalPanicStrength);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            if (centerPortalShader) centerPortalShader.render(currentTime);
            requestAnimationFrame(render);
        }

        render();
})();
