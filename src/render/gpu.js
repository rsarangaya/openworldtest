// Minimal WebGPU renderer: sky, flat-shaded solid meshes, animated water. No libraries, no textures.
// Everything uses one vertex format (pos, normal, colour) and one dynamic-offset uniform per object, so draw calls stay few.
import { mul, perspective, lookAt, model } from './math.js';
import { waterMesh } from '../gen/mesh.js';
import { PAL, SOFT, MID } from './palette.js';

const MAXOBJ = 384, STRIDE = 256;
const WGSL = /*wgsl*/`
struct G{vp:mat4x4f,cam:vec4f,right:vec4f,up:vec4f,fwd:vec4f,sun:vec4f,fogC:vec4f,deepC:vec4f,shalC:vec4f,calm:array<vec4f,8>};
struct O{m:mat4x4f,tint:vec4f};
@group(0)@binding(0) var<uniform> g:G;
@group(1)@binding(0) var<uniform> o:O;
// keep in sync with wave() in rules/sea.js
fn calmAt(p:vec2f)->f32{var c=1.;for(var i=0;i<8;i++){let z=g.calm[i];if(z.z>0.){c=min(c,smoothstep(z.z,z.z*2.1,length(p-z.xy)));}}return c;}
fn wave(p:vec2f,t:f32)->f32{return (1.+g.sun.w)*calmAt(p)*3.*(.6*sin(p.x*.057+p.y*.026+t*.55)+.35*sin(p.x*-.038+p.y*.07+t*.78)+.18*sin(p.x*.085+p.y*-.06+t*1.05));}
fn wv(p:vec2f,t:f32,dist:f32)->vec3f{var r=vec3f(0.);for(var i=0;i<5;i++){let fi=f32(i);let a=.7+fi*1.9;let d=vec2f(cos(a),sin(a));let lam=90./pow(2.,fi*.95);let k=6.2832/lam;let amp=.8*pow(.58,fi)*(1.-smoothstep(lam*3.,lam*10.,dist));let ph=dot(p,d)*k+t*sqrt(k*9.8)*.7+fi*1.7;r+=vec3f(amp*sin(ph),amp*k*cos(ph)*d.x,amp*k*cos(ph)*d.y);}return r;}
fn h21(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn vn(p:vec2f)->f32{let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2f(1.,0.)),u.x),mix(h21(i+vec2f(0.,1.)),h21(i+vec2f(1.,1.)),u.x),u.y);}
fn fbm2(p:vec2f)->f32{return .5*vn(p)+.25*vn(p*2.03)+.125*vn(p*4.1)+.0625*vn(p*8.3);}
fn skyCol(rd:vec3f)->vec3f{
  let h=clamp(rd.y,0.,1.);
  var c=mix(g.fogC.rgb,mix(vec3f(.25,.5,.9),vec3f(.3,.42,.62),g.fwd.w),pow(h,.5));
  let sd=max(dot(rd,normalize(g.sun.xyz)),0.);
  c+=vec3f(1.,.85,.6)*(pow(sd,600.)*3.+pow(sd,12.)*.25);
  if(rd.y>.01){let q=rd.xz/(rd.y+.2)*1.3+vec2f(0.,0.);let n=.6*vn(q*1.6)+.4*vn(q*3.3);let cl=step(.58,n)*step(.03,rd.y);
    c=mix(c,vec3f(1.,.98,.95)*(.78+.22*sd)*mix(1.,.72,g.fwd.w),cl*.9);}
  let o=g.deepC.w;c=mix(c,g.fogC.rgb*(.88+.24*vn(rd.xz/(abs(rd.y)+.25)*2.)),clamp(o*.95,0.,.97));
  return c;}
fn fogMix(c:vec3f,w:vec3f)->vec3f{let d=length(w-g.cam.xyz);let f=clamp(1.-exp(-d*g.fogC.w),0.,1.);return mix(c,g.fogC.rgb,floor(f*8.+.5)/8.);}
struct VO{@builtin(position)p:vec4f,@location(0)w:vec3f,@location(1)n:vec3f,@location(2)c:vec3f,@location(3)d:f32};
@vertex fn vs(@location(0)p:vec3f,@location(1)n:vec3f,@location(2)c:vec3f)->VO{
  var v:VO;let w=o.m*vec4f(p,1.);v.w=w.xyz;v.n=normalize((o.m*vec4f(n,0.)).xyz);v.c=c*o.tint.rgb;v.d=o.tint.w;v.p=g.vp*w;return v;}
@fragment fn fs(v:VO)->@location(0)vec4f{
  var n=normalize(v.n);let vd=normalize(g.cam.xyz-v.w);if(dot(n,vd)<0.){n=-n;}
  let d=max(dot(n,normalize(g.sun.xyz)),0.);
  let dB=floor(d*3.+.5)/3.;let hB=floor((n.y*.5+.5)*3.+.5)/3.;
  let col=v.c*(mix(.45,.7,hB)*vec3f(.68,.72,.85)+dB*vec3f(1.,.92,.78)*.9);
  return vec4f(fogMix(col,v.w),select(1.,.5,v.d>1.5));}
struct SO{@builtin(position)p:vec4f,@location(0)uv:vec2f};
@vertex fn vsSky(@builtin(vertex_index)i:u32)->SO{
  let x=f32((i<<1u)&2u);let y=f32(i&2u);var s:SO;s.p=vec4f(x*2.-1.,y*2.-1.,1.,1.);s.uv=vec2f(x*2.-1.,y*2.-1.);return s;}
@fragment fn fsSky(s:SO)->@location(0)vec4f{
  let rd=normalize(g.fwd.xyz+g.right.xyz*s.uv.x*g.cam.w*g.right.w+g.up.xyz*s.uv.y*g.cam.w);return vec4f(skyCol(rd),1.);}
struct WO{@builtin(position)p:vec4f,@location(0)w:vec3f};
@vertex fn vsW(@location(0)p:vec3f)->WO{
  var w=o.m*vec4f(p,1.);w.y=wave(w.xz,g.up.w);var v:WO;v.w=w.xyz;v.p=g.vp*w;return v;}
@fragment fn fsW(v:WO)->@location(0)vec4f{
  let dist=length(v.w-g.cam.xyz);let W=wv(v.w.xz,g.up.w,dist);
  let T=g.up.w;let sw=vec2f(wave(v.w.xz+vec2f(3.,0.),T)-wave(v.w.xz-vec2f(3.,0.),T),wave(v.w.xz+vec2f(0.,3.),T)-wave(v.w.xz-vec2f(0.,3.),T))/6.; // the big swell's slope, so crests and troughs show
  let n=normalize(vec3f(-W.y*1.1-sw.x*4.5,1.,-W.z*1.1-sw.y*4.5));let vd=normalize(g.cam.xyz-v.w);
  let fr=pow(1.-max(dot(vd,n),0.),4.);let r=reflect(-vd,n);let sky=skyCol(vec3f(r.x,abs(r.y),r.z));
  let hh=clamp(.5+wave(v.w.xz,T)*.15+W.x*.1,0.,1.);
  var col=mix(g.deepC.rgb,g.shalC.rgb,hh*.5+.25);
  col*=.6+.6*clamp(dot(n,normalize(g.sun.xyz))*.9+.1,0.,1.); // lit slopes and shaded backs give the humps their shape
  col=mix(col,sky,clamp(fr*.5+.02,0.,.5));
  let rs=max(dot(r,normalize(g.sun.xyz)),0.);col+=vec3f(1.,.93,.78)*(pow(rs,180.)*4.+pow(rs,24.)*.28);
  let foam=smoothstep(.84,.97,hh+(vn(v.w.xz*.3+g.up.w*.12)-.5)*.25)*(1.-smoothstep(120.,380.,dist));
  col=mix(col,vec3f(.94,.97,1.),foam*.85);
  return vec4f(fogMix(col,v.w),1.);}
@group(2)@binding(0) var tA:texture_2d<f32>;
@group(2)@binding(1) var sA:sampler;
struct BI{@location(0)a:vec4f,@location(1)b:vec4f,@location(2)c:vec4f};
struct BO{@builtin(position)p:vec4f,@location(0)w:vec3f,@location(1)uv:vec2f};
@vertex fn vsB(@builtin(vertex_index)vi:u32,i:BI)->BO{
  let cx=f32(vi&1u);let cy=f32((vi>>1u)&1u);var r=vec3f(g.right.x,0.,g.right.z);var sc=abs(i.a.w);if(i.a.w<-500.){r=vec3f(0.,0.,1.);sc=1.;}else if(i.a.w<0.){r=vec3f(1.,0.,0.);}
  let w=i.a.xyz+r*(mix(i.b.x,i.b.y,cx)*sc)+vec3f(0.,mix(i.b.w,i.b.z,cy)*sc,0.);
  var o2:BO;o2.w=w;o2.p=g.vp*vec4f(w,1.);o2.uv=vec2f(mix(i.c.x,i.c.z,cx),mix(i.c.w,i.c.y,cy));return o2;}
@fragment fn fsB(v:BO)->@location(0)vec4f{let t=textureSampleLevel(tA,sA,v.uv,0.);if(t.a<.5){discard;}return vec4f(fogMix(t.rgb,v.w),1.);}
`;

export async function createRenderer(canvas) {
  if (!navigator.gpu) throw new Error('This game needs WebGPU. Use a current Chrome or Edge on a desktop computer.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU graphics adapter was found.');
  const device = await adapter.requestDevice(), Q = device.queue, ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
  let lost = null; device.lost.then((i) => { lost = i.message || 'GPU device lost'; });
  const BU = GPUBufferUsage, mod = device.createShaderModule({ code: WGSL }), SF = 'rgba8unorm'; // SF: the low-res scene target
  const gBuf = device.createBuffer({ size: 512, usage: BU.UNIFORM | BU.COPY_DST }), oBuf = device.createBuffer({ size: MAXOBJ * STRIDE, usage: BU.UNIFORM | BU.COPY_DST });
  const bgl0 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }] });
  const bgl1 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 80 } }] });
  const bg0 = device.createBindGroup({ layout: bgl0, entries: [{ binding: 0, resource: { buffer: gBuf } }] });
  const bg1 = device.createBindGroup({ layout: bgl1, entries: [{ binding: 0, resource: { buffer: oBuf, size: 80 } }] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1] });
  const vbl = { arrayStride: 36, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x3' }] };
  const depth = (write, cmp) => ({ format: 'depth24plus', depthWriteEnabled: write, depthCompare: cmp });
  const pSky = device.createRenderPipeline({ layout, vertex: { module: mod, entryPoint: 'vsSky' }, fragment: { module: mod, entryPoint: 'fsSky', targets: [{ format: SF }] }, depthStencil: depth(false, 'always') });
  const pSolid = device.createRenderPipeline({ layout, vertex: { module: mod, entryPoint: 'vs', buffers: [vbl] }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: SF }] }, primitive: { cullMode: 'none' }, depthStencil: depth(true, 'less') });
  const blend = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
  const pWater = device.createRenderPipeline({ layout, vertex: { module: mod, entryPoint: 'vsW', buffers: [vbl] }, fragment: { module: mod, entryPoint: 'fsW', targets: [{ format: SF, blend }] }, primitive: { cullMode: 'none' }, depthStencil: depth(true, 'less') });

  const hexv = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; };
  const palData = new Float32Array((PAL.length + 1) * 4 + 4); PAL.forEach((h, i) => palData.set(hexv(h), i * 4));
  const pBuf = device.createBuffer({ size: palData.byteLength, usage: BU.UNIFORM | BU.COPY_DST });
  const mPost = device.createShaderModule({ code: `
struct PU{pal:array<vec4f,${PAL.length + 1}>,prm:vec4f};
@group(0)@binding(0) var<uniform> pu:PU;
@group(0)@binding(1) var tC:texture_2d<f32>;
@group(0)@binding(2) var tD:texture_depth_2d;
@vertex fn vsP(@builtin(vertex_index)i:u32)->@builtin(position) vec4f{let x=f32((i<<1u)&2u);let y=f32(i&2u);return vec4f(x*2.-1.,y*2.-1.,0.,1.);}
fn zl(d:f32)->f32{let n=pu.prm.z;let f=pu.prm.w;return f*n/(f-d*(f-n));}
const BAYER=array<f32,16>(0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
@fragment fn fsP(@builtin(position)p:vec4f)->@location(0)vec4f{
  let ip=vec2i(p.xy);let sz=vec2i(textureDimensions(tC));
  var c=textureLoad(tC,ip,0).rgb;
  let z0=zl(textureLoad(tD,ip,0));var edge=false;
  if(z0<110.){for(var k=0;k<4;k++){var o=vec2i(1,0);if(k==1){o=vec2i(-1,0);}if(k==2){o=vec2i(0,1);}if(k==3){o=vec2i(0,-1);}
    let q=clamp(ip+o,vec2i(0),sz-vec2i(1));let zq=zl(textureLoad(tD,q,0));
    if(zq<z0-max(z0*pu.prm.y,.45)&&(pu.prm.x<1.5||textureLoad(tC,q,0).a>.9)){edge=true;}}}
  if(!edge&&z0<45.&&textureLoad(tC,ip,0).a>.9){ // creases: where two walls or roof planes meet, 1/depth stops being a straight line across the pixel
    let zr=zl(textureLoad(tD,clamp(ip+vec2i(1,0),vec2i(0),sz-vec2i(1)),0));let zlf=zl(textureLoad(tD,clamp(ip+vec2i(-1,0),vec2i(0),sz-vec2i(1)),0));
    let zd=zl(textureLoad(tD,clamp(ip+vec2i(0,1),vec2i(0),sz-vec2i(1)),0));let zu=zl(textureLoad(tD,clamp(ip+vec2i(0,-1),vec2i(0),sz-vec2i(1)),0));
    let c0=1./z0;
    if(abs(zr-z0)<z0*.25&&abs(zlf-z0)<z0*.25&&abs(zd-z0)<z0*.25&&abs(zu-z0)<z0*.25&&max(abs(1./zr+1./zlf-2.*c0),abs(1./zd+1./zu-2.*c0))>c0*.04){edge=true;}}
  if(edge){return vec4f(pu.pal[0].rgb,1.);}
  if(pu.prm.x>.5&&pu.prm.x<1.5){return vec4f(c,1.);}
  var best=pu.pal[1].rgb;var bd=1e9;
  for(var j=1;j<${PAL.length};j++){let q=pu.pal[j].rgb;let d=(c-q)*(c-q);let e=d.x*3.+d.y*4.+d.z*2.;if(e<bd){bd=e;best=q;}}
  return vec4f(best,1.);}
` });
  const pPost = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPost, entryPoint: 'vsP' }, fragment: { module: mPost, entryPoint: 'fsP', targets: [{ format: FMT }] } });
  let sceneTex = null, postBG = null;
  // ---- billboard sprites: one atlas texture (shelf-packed), one instanced quad pipeline
  const AT = 2048, atlas = device.createTexture({ size: [AT, AT], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  const bglA = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} }, { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} }] });
  const atlasBG = device.createBindGroup({ layout: bglA, entries: [{ binding: 0, resource: atlas.createView() }, { binding: 1, resource: device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' }) }] });
  const MAXBB = 8000, bbBuf = device.createBuffer({ size: MAXBB * 48, usage: BU.VERTEX | BU.COPY_DST });
  const pBB = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1, bglA] }),
    vertex: { module: mod, entryPoint: 'vsB', buffers: [{ arrayStride: 48, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }, { shaderLocation: 2, offset: 32, format: 'float32x4' }] }] },
    fragment: { module: mod, entryPoint: 'fsB', targets: [{ format: SF }] }, primitive: { topology: 'triangle-strip', cullMode: 'none' }, depthStencil: depth(true, 'less') });
  let ax = 0, ay = 0, rowH = 0, atlasEpoch = 0;
  function addSprite(canvas) { // returns uv rect {u0,v0,u1,v1}; when the atlas is full it starts over (atlasEpoch changes, so callers re-bake)
    const w = canvas.width, h = canvas.height;
    if (ax + w > AT) { ax = 0; ay += rowH + 1; rowH = 0; }
    if (ay + h > AT) { ax = ay = rowH = 0; atlasEpoch++; }
    Q.copyExternalImageToTexture({ source: canvas }, { texture: atlas, origin: [ax, ay] }, [w, h]);
    const uv = { u0: ax / AT, v0: ay / AT, u1: (ax + w) / AT, v1: (ay + h) / AT }; ax += w + 1; rowH = Math.max(rowH, h); return uv;
  }
  const upload = (mesh) => {
    const d = mesh.data(), b = device.createBuffer({ size: Math.max(16, d.byteLength), usage: BU.VERTEX | BU.COPY_DST }); Q.writeBuffer(b, 0, d);
    return { buf: b, count: mesh.count };
  };
  const water = upload(waterMesh(200));
  let W = 0, H = 0, depthTex = null;
  const G = new Float32Array(80), objs = new Float32Array(MAXOBJ * 64);
  const resize = (w, h) => {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0); if (w === W && h === H) return;
    W = canvas.width = w; H = canvas.height = h; depthTex?.destroy(); sceneTex?.destroy();
    depthTex = device.createTexture({ size: [W, H], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    sceneTex = device.createTexture({ size: [W, H], format: SF, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    postBG = device.createBindGroup({ layout: pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: pBuf } }, { binding: 1, resource: sceneTex.createView() }, { binding: 2, resource: depthTex.createView({ aspect: 'depth-only' }) }] });
  };
  // frame: { cam:{x,y,z,yaw,pitch,fov}, t, far, extent, pal:{fog,density,deep,shal,cold}, objects:[{m, mat, tint}] }
  function draw(f) {
    if (lost || !depthTex) return;
    const c = f.cam, cp = Math.cos(c.pitch), fx = cp * Math.cos(c.yaw), fy = Math.sin(c.pitch), fz = cp * Math.sin(c.yaw);
    let sx = -fz, sz = fx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const ux = -fy * 0 + (0 * fz - sz * fy), uy = sz * fx - sx * fz, uz = sx * fy - 0 * fx; // up = right x forward
    const vp = mul(perspective(c.fov, W / H, 0.1, f.far), lookAt(c.x, c.y, c.z, c.x + fx, c.y + fy, c.z + fz));
    G.set(vp, 0);
    G.set([c.x, c.y, c.z, Math.tan(c.fov / 2), sx, 0, sz, W / H, ux, uy, uz, f.t, fx, fy, fz, f.pal.cold, 0.45, 0.8, 0.3, (f.pal.rough || 1) - 1, ...f.pal.fog, f.pal.density, ...f.pal.deep, f.pal.over || 0, ...f.pal.shal, 0], 16);
    for (let i = 0; i < 8; i++) { const z = f.calm?.[i]; G.set(z ? [z[0], z[1], z[2], 0] : [0, 0, 0, 0], 48 + i * 4); }
    Q.writeBuffer(gBuf, 0, G, 0, 80);
    const ext = f.extent, cell = 1.5, // the water grid follows the camera in small steps (its cells under the ship are a couple of units)
      wm = model(Math.round(c.x / cell) * cell, 0, Math.round(c.z / cell) * cell, 0, 0, 0, ext);
    const list = f.objects, n = Math.min(list.length, MAXOBJ - 1);
    for (let i = 0; i < n; i++) { objs.set(list[i].mat, i * 64); objs.set([...list[i].tint, list[i].detail || 0], i * 64 + 16); }
    objs.set(wm, n * 64); objs.set([1, 1, 1, 1], n * 64 + 16);
    Q.writeBuffer(oBuf, 0, objs, 0, (n + 1) * 64);
    const enc = device.createCommandEncoder(), fogC = f.pal.fog;
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: sceneTex.createView(), clearValue: { r: fogC[0], g: fogC[1], b: fogC[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: depthTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
    pass.setBindGroup(0, bg0);
    pass.setPipeline(pSky); pass.setBindGroup(1, bg1, [0]); pass.draw(3);
    pass.setPipeline(pSolid);
    for (let i = 0; i < n; i++) { pass.setBindGroup(1, bg1, [i * STRIDE]); pass.setVertexBuffer(0, list[i].m.buf); pass.draw(list[i].m.count); }
    if (f.bb && f.bb.n) { Q.writeBuffer(bbBuf, 0, f.bb.data, 0, Math.min(f.bb.n, MAXBB) * 12); pass.setPipeline(pBB); pass.setBindGroup(1, bg1, [0]); pass.setBindGroup(2, atlasBG); pass.setVertexBuffer(0, bbBuf); pass.draw(4, Math.min(f.bb.n, MAXBB)); }
    pass.setPipeline(pWater); pass.setBindGroup(1, bg1, [n * STRIDE]); pass.setVertexBuffer(0, water.buf); pass.draw(water.count);
    pass.end();
    const pb = (PAL.length + 1) * 4; palData[pb] = SOFT ? 1 : MID ? 2 : 0; palData[pb + 1] = 0.22; palData[pb + 2] = 0.4; palData[pb + 3] = f.far; Q.writeBuffer(pBuf, 0, palData); // dither strength, outline sensitivity, near, far
    const p2 = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    p2.setPipeline(pPost); p2.setBindGroup(0, postBG); p2.draw(3); p2.end();
    Q.submit([enc.finish()]);
  }
  return { addSprite, get atlasEpoch() { return atlasEpoch; }, resize, upload, update: (m, data) => Q.writeBuffer(m.buf, 0, data), free: (m) => m.buf.destroy(), draw, get lost() { return lost; }, device };
}
