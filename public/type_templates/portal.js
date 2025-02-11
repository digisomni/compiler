import * as THREE from 'three';

//

const localVector2D = new THREE.Vector2();

//

const getNoiseTexture = (() => {
  let noiseTexture = null;
  return () => {
    if (!noiseTexture) {
      noiseTexture = new THREE.TextureLoader().load('/images/noise.png');
    }
    return noiseTexture;
  };
})();

export class PortalMesh extends THREE.Mesh {
  constructor({
    renderer,
    portalScene,
    portalCamera,
  }) {
    const portalWorldSize = 4;
    
    const geometry = new THREE.PlaneGeometry(portalWorldSize / 1.5, portalWorldSize);

    const iChannel0 = getNoiseTexture();
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        iTime: {
          value: 0,
          needsUpdate: true,
        },
        iChannel0: {
          value: iChannel0,
          needsUpdate: true,
        },
        iChannel1: {
          value: null,
          needsUpdate: true,
        },
        iResolution: {
          value: new THREE.Vector2(1024, 1024),
          needsUpdate: true,
        },
        scale: {
          value: 1,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        uniform float scale;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vModelPosition;

        void main() {
          vec3 p = position;
          p *= scale;

          vec4 modelPosition = modelMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * viewMatrix * modelPosition;

          vNormal = normal;
          // transform the normal to model space
          vNormal = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * vNormal);

          vUv = uv;
          vModelPosition = modelPosition.xyz;
        }
      `,
      fragmentShader: `\
        //Noise animation - Electric
        //by nimitz (stormoid.com) (twitter: @stormoid)
        //modified to look like a portal by Pleh
        //fbm tweaks by foxes
        
        //The domain is displaced by two fbm calls one for each axis.
        //Turbulent fbm (aka ridged) is used for better effect.
        
        uniform float iTime;
        uniform sampler2D iChannel0;
        uniform sampler2D iChannel1;
        uniform vec2 iResolution;
        uniform float scale;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vModelPosition;
        // varying vec2 vScreenSpaceUv;
        
        #define PI 3.1415926535897932384626433832795
        #define tau (PI * 2.)
        #define time (iTime * 0.2)
        
        vec3 hueShift( vec3 color, float hueAdjust ){
            const vec3  kRGBToYPrime = vec3 (0.299, 0.587, 0.114);
            const vec3  kRGBToI      = vec3 (0.596, -0.275, -0.321);
            const vec3  kRGBToQ      = vec3 (0.212, -0.523, 0.311);
        
            const vec3  kYIQToR     = vec3 (1.0, 0.956, 0.621);
            const vec3  kYIQToG     = vec3 (1.0, -0.272, -0.647);
            const vec3  kYIQToB     = vec3 (1.0, -1.107, 1.704);
        
            float   YPrime  = dot (color, kRGBToYPrime);
            float   I       = dot (color, kRGBToI);
            float   Q       = dot (color, kRGBToQ);
            float   hue     = atan (Q, I);
            float   chroma  = sqrt (I * I + Q * Q);
        
            hue += hueAdjust;
        
            Q = chroma * sin (hue);
            I = chroma * cos (hue);
        
            vec3    yIQ   = vec3 (YPrime, I, Q);
        
            return vec3( dot (yIQ, kYIQToR), dot (yIQ, kYIQToG), dot (yIQ, kYIQToB) );
        }

        mat2 makem2(in float theta){float c = cos(theta);float s = sin(theta);return mat2(c,-s,s,c);}
        float noise( in vec2 x ){return texture(iChannel0, x*.01).x;}
        
        float fbm(in vec2 p) {
          vec4 tt=fract(vec4(time)+vec4(0.0,0.25,0.5,0.75));
          vec2 p1=p-normalize(p)*tt.x;
          vec2 p2=vec2(1.0)+p-normalize(p)*tt.y;
          vec2 p3=vec2(2.0)+p-normalize(p)*tt.z;
          vec2 p4=vec2(3.0)+p-normalize(p)*tt.w;
          vec4 tr=vec4(1.0)-abs(tt-vec4(0.5))*2.0;
          float z = 2.;
          vec4 rz = vec4(0.);
          for (float i= 1.; i < 4.; i++) {
            rz += abs((vec4(noise(p1),noise(p2),noise(p3),noise(p4))-vec4(0.5))*2.)/z;
            z = z*2.;
            p1 = p1*2.;
            p2 = p2*2.;
            p3 = p3*2.;
            p4 = p4*2.;
          }
          return dot(rz,tr)*0.25;
        }
        float dualfbm(in vec2 p) {
          //get two rotated fbm calls and displace the domain
          vec2 p2 = p*.7;
          vec2 basis = vec2(fbm(p2-time*1.6),fbm(p2+time*1.7));
          basis = (basis-.5)*.2;
          p += basis;
          
          //coloring
          return fbm(p);
        }        
        bool isFrontFacing() {
          vec3 fdx = dFdx(vModelPosition);
          vec3 fdy = dFdy(vModelPosition);
          vec3 faceNormal = normalize(cross(fdx,fdy));
          if (dot (vNormal, faceNormal) > 0.0) {
            // gl_FrontFacing is almost certainly true
            return true;
          } else {
            return false;
          }
        }
        float circ(vec2 p) {
          float r = length(p);
          r = sqrt(r);
          r = log(r);
          r = abs(mod(r*2.,tau)-4.54)*3.+.5;
          return r;
        }
        float circ2(vec2 p) {
          float r = length(p);
          r = log(sqrt(r));
          return 0.125 - r;
        }
        
        void main() {
          // setup system
          vec2 uv = vUv;

          // vScreenSpaceUv based on iResolution, in the range [0, 1]
          vec2 vScreenSpaceUv = gl_FragCoord.xy / iResolution.xy;

          float dx = 5.0;
          float dy = 5.0;

          vec2 p = (uv - 0.5) * dx;

          float rz;
          
          // rings
          if (length (p) > 0.01) {
            rz = dualfbm(p);
            rz *= abs((-circ(vec2(p.x / dx, p.y / dy))));
            rz *= abs((-circ(vec2(p.x / dx, p.y / dy))));
            rz *= abs((-circ(vec2(p.x / dx, p.y / dy))));
          } else {
            rz = 1. / length (p);
          }

          // final color
          vec4 mainColor = vec4(.15, 0.1, 0.1, 0.05);
          mainColor.rgb = hueShift(mainColor.rgb, mod(time * tau * 2., tau));
          float darkenFactor = 0.1;
            
          vec4 col = mainColor/rz;
          // col = pow(abs(col),vec4(.99));
          col.rgb *= darkenFactor;

          vec4 bgInner = texture(iChannel1, vScreenSpaceUv);
          // vec4 bgInner = vec4(vScreenSpaceUv, 0., 0.);
          vec4 bgOuter = vec4(0., 0., 0., 0.);

          // gl_FragColor = vec4((col.rgb*col.a + bgOuter.rgb*(1.0-col.a)),1.0);
          gl_FragColor = mix(vec4(col.rgb, 1.), bgOuter, 1.- col.a);

          float factor = circ2(vec2(p.x / dx, p.y / dy));
          // only if front facing
          if (
            factor > 1.
          ) {
            if (isFrontFacing()) {
              gl_FragColor.rgb = mix(gl_FragColor.rgb, bgInner.rgb, 1. - col.a);
            } else {
              gl_FragColor.rgb = vec3(1.);
            }
            gl_FragColor.a = 1.;
          }

          gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(1.));
          if (!isFrontFacing()) {
            gl_FragColor.rgb *= 0.1;
          }

          if (gl_FragColor.a < 0.2) {
            discard;
          }
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });

    super(geometry, material);

    this.renderer = renderer;
    this.portalScene = portalScene;
    this.portalCamera = portalCamera;

    this.portalSceneRenderTarget = null;
  }
  getScale() {
    return this.material.uniforms.scale.value;
  }
  setScale(scale) {
    this.material.uniforms.scale.value = scale;
    this.material.uniforms.scale.needsUpdate = true;
  }
  update(timestamp) {
    const maxTime = 1000;
    this.material.uniforms.iTime.value = timestamp / maxTime;
    this.material.uniforms.iTime.needsUpdate = true;

    const size = this.renderer.getSize(localVector2D);

    const pixelRatio = this.renderer.getPixelRatio();
    this.material.uniforms.iResolution.value.set(size.x * pixelRatio, size.y * pixelRatio);
    this.material.uniforms.iResolution.needsUpdate = true;

    if (
      this.portalSceneRenderTarget && (
        this.portalSceneRenderTarget.width !== size.x ||
        this.portalSceneRenderTarget.height !== size.y
      )
    ) {
      // console.log('dispose portal', this.portalSceneRenderTarget.width, this.portalSceneRenderTarget.height);
      this.portalSceneRenderTarget.dispose();
      this.portalSceneRenderTarget = null;
    }

    if (!this.portalSceneRenderTarget) {
      const portalSceneRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
      });
      this.material.uniforms.iChannel1.value = portalSceneRenderTarget.texture;
      this.material.uniforms.iChannel1.needsUpdate = true;

      // console.log('render portal', size.x, size.y, portalSceneRenderTarget.texture);

      this.portalSceneRenderTarget = portalSceneRenderTarget;
    }

    // pre
    const oldRenderTarget = this.renderer.getRenderTarget();
    // const oldPixelRatio = this.renderer.getPixelRatio();
    // this.renderer.setPixelRatio(1);
    this.renderer.setRenderTarget(this.portalSceneRenderTarget);
    // render
    this.renderer.clear();
    this.renderer.render(this.portalScene, this.portalCamera);
    // post
    this.renderer.setRenderTarget(oldRenderTarget);
    // this.renderer.setPixelRatio(oldPixelRatio);
  }
}

//

export default ctx => {
  const {
    useApp,
    useRenderer,
    useCamera,
    createAppManager,
    useLocalPlayer,
    useCleanup,
  } = ctx;

  const app = useApp();

  const srcUrl = ${this.srcUrl};
  
  ctx.waitUntil((async () => {
    const res = await fetch(srcUrl);
    const json = await res.json();

    console.log('portal json', json);
    const {
      portalContents = [
        {
          start_url: '/models/skybox.glb',
        },
      ],
    } = json;

    //

    const appManager = createAppManager();
    let portalContentsApps = [];
    for (let i = 0; i < portalContents.length; i++) {
      const {
        start_url,
        type,
        content,
        components,
      } = portalContents[i];

      // const portalContentApp = new App();
      // portalContentApps.add(portalContentApp);

      (async () => {
        const portalContentsApp = await appManager.addAppAsync({
          contentId: start_url,
          type,
          content,
          // position,
          // quaternion,
          // scale,
          components,
        });
        portalContentsApps.push(portalContentsApp);
        // console.log('loaded portal content app', {start_url}, portalContentsApp);
      })();

      app.swapApps = (otherApps, otherAppManager) => {
        const oldPortalContentsApps = portalContentsApps.slice();

        for (let i = 0; i < portalContentsApps.length; i++) {
          appManager.transplantApp(portalContentsApps[i], otherAppManager);
        }
        portalContentsApps.length = 0;

        for (let i = 0; i < otherApps.length; i++) {
          const otherApp = otherApps[i];
          otherAppManager.transplantApp(otherApp, appManager);
          portalContentsApps.push(otherApp);
        }
        return oldPortalContentsApps;
      };
    }

    //

    const renderer = useRenderer();
    const camera = useCamera();

    const portalScene = new THREE.Scene();
    portalScene.name = 'portalScene';
    portalScene.autoUpdate = false;

    portalScene.add(appManager);
    appManager.updateMatrixWorld();

    // const size = 2;

    // const portalCamera = camera.clone();
    const portalCamera = camera.clone();
    const portalMesh = new PortalMesh({
        renderer,
        portalScene,
        portalCamera,
    });
    app.add(portalMesh);
    portalMesh.updateMatrixWorld();
    // portalMesh.onBeforeRender = () => {
    //   console.log('render portal');
    // };
    // globalThis.portalMesh = portalMesh;

    // support walking through the portal
    // {
    //   const localPlayer = useLocalPlayer();
    //   // XXX
    // }

    // render loop
    const _recurse = () => {
      frame = requestAnimationFrame(_recurse);

      const xrCamera = renderer.xr.getSession() ? renderer.xr.getCamera(camera) : camera;
      // console.log('got camera position', camera.position.toArray(), xrCamera.position.toArray());
      portalCamera.position.copy(xrCamera.position);
      portalCamera.quaternion.copy(xrCamera.quaternion);
      portalCamera.updateMatrixWorld();

      const now = performance.now();
      portalMesh.update(now);
    };
    let frame = requestAnimationFrame(_recurse);

    useCleanup(() => {
      cancelAnimationFrame(frame);
    });

    // await worldZine.addWorldZine(app, json);

    // useCleanup(() => {
    //   worldZine.removeWorldZine(app, json);
    // });

    // // camera manager
    // const zineCameraManager = new ZineCameraManager({
    //   camera,
    //   localPlayer,
    // }, {
    //   normalizeView: false,
    //   followView: false,
    // });
    // zineCameraManager.setLockCamera(camera);
    // zineCameraManager.toggleCameraLock();

    // console.log('zine load 2');
    // const zineInstance = await zine.createStoryboardInstanceAsync({
    //   start_url: srcUrl,
    //   zineCameraManager,
    //   physics,
    //   localPlayer,
    //   spawnManager,
    //   ctx,
    // });
    // console.log('zine load 3');
    // app.add(zineInstance);
    // zineInstance.updateMatrixWorld();
    
    // app.zineInstance = zineInstance;
    // app.physicsIds = zineInstance?.physicsIds ?? [];

    // console.log('zine load 4');
    // await zineInstance.spawn();
    // console.log('zine load 5');
  })());

  return app;
};
export const contentId = ${this.contentId};
export const name = ${this.name};
export const description = ${this.description};
export const type = 'portal';
export const components = ${this.components};