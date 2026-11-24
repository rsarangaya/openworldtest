// Minimal WebGPU renderer: sky, flat-shaded solid meshes, animated water. No libraries, no textures.
// Everything uses one vertex format (pos, normal, colour) and one dynamic-offset uniform per object, so draw calls stay few.
import { mul, perspective, lookAt, model } from './math.js';
import { waterMesh } from '../gen/mesh.js';

const MAXOBJ = 384, STRIDE = 256;
const WGSL = /*wgsl*/`
struct G{vp:mat4x4f,cam:vec4f,right:vec4f,up:vec4f,fwd:vec4f,sun:vec4f,fogC:vec4f,deepC:vec4f,shalC:vec4f};
struct O{m:mat4x4f,tint:vec4f};
@group(0)@binding(0) var<uniform> g:G;
@group(1)@binding(0) var<uniform> o:O;
// keep in sync with wave() in rules/sea.js
fn wave(p:vec2f,t:f32)->f32{return .55*sin(p.x*.045+p.y*.02+t*.9)+.3*sin(p.x*-.03+p.y*.07+t*1.3)+.12*sin(p.x*.13+p.y*.11+t*2.1);}
fn h21(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn vn(p:vec2f)->f32{let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2f(1.,0.)),u.x),mix(h21(i+vec2f(0.,1.)),h21(i+vec2f(1.,1.)),u.x),u.y);}
fn fbm2(p:vec2f)->f32{return .5*vn(p)+.25*vn(p*2.03)+.125*vn(p*4.1)+.0625*vn(p*8.3);}
fn skyCol(rd:vec3f)->vec3f{
  let h=clamp(rd.y,0.,1.);
  var c=mix(g.fogC.rgb,mix(vec3f(.25,.5,.9),vec3f(.3,.42,.62),g.fwd.w),pow(h,.5));
  let sd=max(dot(rd,normalize(g.sun.xyz)),0.);
  c+=vec3f(1.,.85,.6)*(pow(sd,600.)*3.+pow(sd,12.)*.25);
  if(rd.y>.01){let q=rd.xz/(rd.y+.2)*1.3+vec2f(g.up.w*.012,0.);let n=fbm2(q*1.6);let cl=smoothstep(.5,.78,n)*smoothstep(.01,.2,rd.y);
    c=mix(c,vec3f(1.,.98,.95)*(.78+.22*sd)*mix(1.,.72,g.fwd.w),cl*.85);}
  return c;}
fn fogMix(c:vec3f,w:vec3f)->vec3f{let d=length(w-g.cam.xyz);return mix(c,g.fogC.rgb,clamp(1.-exp(-d*g.fogC.w),0.,1.));}
struct VO{@builtin(position)p:vec4f,@location(0)w:vec3f,@location(1)n:vec3f,@location(2)c:vec3f,@location(3)d:f32};
@vertex fn vs(@location(0)p:vec3f,@location(1)n:vec3f,@location(2)c:vec3f)->VO{
  var v:VO;let w=o.m*vec4f(p,1.);v.w=w.xyz;v.n=normalize((o.m*vec4f(n,0.)).xyz);v.c=c*o.tint.rgb;v.d=o.tint.w;v.p=g.vp*w;return v;}
@fragment fn fs(v:VO)->@location(0)vec4f{
  var n=normalize(v.n);let vd=normalize(g.cam.xyz-v.w);if(dot(n,vd)<0.){n=-n;}
  let d=max(dot(n,normalize(g.sun.xyz)),0.);
  var base=v.c;
  if(v.d>.5){let q=floor(v.w.xz*1.25);let nz=fract(sin(dot(q,vec2f(12.9898,78.233)))*43758.5453);base=base*(.9+.2*nz);}
  let col=base*(mix(.35,.65,n.y*.5+.5)*vec3f(.55,.65,.8)+d*vec3f(1.,.92,.78)*.9);
  return vec4f(fogMix(col,v.w),1.);}
struct SO{@builtin(position)p:vec4f,@location(0)uv:vec2f};
@vertex fn vsSky(@builtin(vertex_index)i:u32)->SO{
  let x=f32((i<<1u)&2u);let y=f32(i&2u);var s:SO;s.p=vec4f(x*2.-1.,y*2.-1.,1.,1.);s.uv=vec2f(x*2.-1.,y*2.-1.);return s;}
@fragment fn fsSky(s:SO)->@location(0)vec4f{
  let rd=normalize(g.fwd.xyz+g.right.xyz*s.uv.x*g.cam.w*g.right.w+g.up.xyz*s.uv.y*g.cam.w);return vec4f(skyCol(rd),1.);}
struct WO{@builtin(position)p:vec4f,@location(0)w:vec3f};
@vertex fn vsW(@location(0)p:vec3f)->WO{
  var w=o.m*vec4f(p,1.);w.y=wave(w.xz,g.up.w);var v:WO;v.w=w.xyz;v.p=g.vp*w;return v;}
@fragment fn fsW(v:WO)->@location(0)vec4f{
  let e=.6;let t=g.up.w;
  var n=normalize(vec3f(wave(v.w.xz-vec2f(e,0.),t)-wave(v.w.xz+vec2f(e,0.),t),2.*e,wave(v.w.xz-vec2f(0.,e),t)-wave(v.w.xz+vec2f(0.,e),t)));
  let rp=v.w.xz*.35;n=normalize(n+vec3f(vn(rp+vec2f(t*.2,0.))-.5,0.,vn(rp.yx-vec2f(t*.17,0.))-.5)*.2);
  let vd=normalize(g.cam.xyz-v.w);let fr=pow(1.-max(dot(n,vd),0.),4.);let rd=reflect(-vd,n);let L=normalize(g.sun.xyz);
  var col=mix(g.deepC.rgb,g.shalC.rgb,pow(max(dot(n,L),0.),2.)*.35+.1*vn(v.w.xz*.05));
  col=mix(col,skyCol(vec3f(rd.x,abs(rd.y),rd.z)),clamp(fr*.9+.04,0.,1.));
  col+=vec3f(1.,.9,.7)*pow(max(dot(rd,L),0.),160.)*1.6;
  let crest=wave(v.w.xz,t)+(vn(v.w.xz*.8+vec2f(t*.3,0.))-.5)*.35;
  col=mix(col,vec3f(.95,.98,1.),smoothstep(.68,1.,crest)*.55);
  return vec4f(fogMix(col,v.w),.88);}
`;

export async function createRenderer(canvas) {
  if (!navigator.gpu) throw new Error('This game needs WebGPU. Use a current Chrome or Edge on a desktop computer.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU graphics adapter was found.');
  const device = await adapter.requestDevice(), Q = device.queue, ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
  let lost = null; device.lost.then((i) => { lost = i.message || 'GPU device lost'; });
  const BU = GPUBufferUsage, mod = device.createShaderModule({ code: WGSL });
  const gBuf = device.createBuffer({ size: 256, usage: BU.UNIFORM | BU.COPY_DST }), oBuf = device.createBuffer({ size: MAXOBJ * STRIDE, usage: BU.UNIFORM | BU.COPY_DST });
  const bgl0 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }] });
  const bgl1 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 80 } }] });
  const bg0 = device.createBindGroup({ layout: bgl0, entries: [{ binding: 0, resource: { buffer: gBuf } }] });
  const bg1 = device.createBindGroup({ layout: bgl1, entries: [{ binding: 0, resource: { buffer: oBuf, size: 80 } }] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1] });
  const vbl = { arrayStride: 36, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x3' }] };
  const depth = (write, cmp) => ({ format: 'depth24plus', depthWriteEnabled: write, depthCompare: cmp });
  const pSky = device.createRenderPipeline({ layout, vertex: { module: mod, entryPoint: 'vsSky' }, fragment: { module: mod, entryPoint: 'fsSky', targets: [{ format: FMT }] }, depthStencil: depth(false, 'always') });
  const pSolid = device.createRenderPipeline({ layout, vertex: { module: mod, entryPoint: 'vs', buffers: [vbl] }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: FMT }] }, primitive: { cullMode: 'none' }, depthStencil: depth(true, 'less') });
  const blend = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
  const pWater = device.createRenderPipeline({ layout, vertex: { module: mod, entryPoint: 'vsW', buffers: [vbl] }, fragment: { module: mod, entryPoint: 'fsW', targets: [{ format: FMT, blend }] }, primitive: { cullMode: 'none' }, depthStencil: depth(true, 'less') });

  const upload = (mesh) => {
    const d = mesh.data(), b = device.createBuffer({ size: Math.max(16, d.byteLength), usage: BU.VERTEX | BU.COPY_DST }); Q.writeBuffer(b, 0, d);
    return { buf: b, count: mesh.count };
  };
  const water = upload(waterMesh(140));
  let W = 0, H = 0, depthTex = null;
  const G = new Float32Array(64), objs = new Float32Array(MAXOBJ * 64);
  const resize = (w, h) => {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0); if (w === W && h === H) return;
    W = canvas.width = w; H = canvas.height = h; depthTex?.destroy();
    depthTex = device.createTexture({ size: [W, H], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  };
  // frame: { cam:{x,y,z,yaw,pitch,fov}, t, far, extent, pal:{fog,density,deep,shal,cold}, objects:[{m, mat, tint}] }
  function draw(f) {
    if (lost || !depthTex) return;
    const c = f.cam, cp = Math.cos(c.pitch), fx = cp * Math.cos(c.yaw), fy = Math.sin(c.pitch), fz = cp * Math.sin(c.yaw);
    let sx = -fz, sz = fx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const ux = -fy * 0 + (0 * fz - sz * fy), uy = sz * fx - sx * fz, uz = sx * fy - 0 * fx; // up = right x forward
    const vp = mul(perspective(c.fov, W / H, 0.4, f.far), lookAt(c.x, c.y, c.z, c.x + fx, c.y + fy, c.z + fz));
    G.set(vp, 0);
    G.set([c.x, c.y, c.z, Math.tan(c.fov / 2), sx, 0, sz, W / H, ux, uy, uz, f.t, fx, fy, fz, f.pal.cold, 0.45, 0.8, 0.3, 0, ...f.pal.fog, f.pal.density, ...f.pal.deep, 0, ...f.pal.shal, 0], 16);
    Q.writeBuffer(gBuf, 0, G, 0, 48);
    const ext = f.extent, cell = (2 * ext) / 140, wm = model(Math.round(c.x / cell) * cell, 0, Math.round(c.z / cell) * cell, 0, 0, 0, ext);
    const list = f.objects, n = Math.min(list.length, MAXOBJ - 1);
    for (let i = 0; i < n; i++) { objs.set(list[i].mat, i * 64); objs.set([...list[i].tint, list[i].detail || 0], i * 64 + 16); }
    objs.set(wm, n * 64); objs.set([1, 1, 1, 1], n * 64 + 16);
    Q.writeBuffer(oBuf, 0, objs, 0, (n + 1) * 64);
    const enc = device.createCommandEncoder(), fogC = f.pal.fog;
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: fogC[0], g: fogC[1], b: fogC[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: depthTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
    pass.setBindGroup(0, bg0);
    pass.setPipeline(pSky); pass.setBindGroup(1, bg1, [0]); pass.draw(3);
    pass.setPipeline(pSolid);
    for (let i = 0; i < n; i++) { pass.setBindGroup(1, bg1, [i * STRIDE]); pass.setVertexBuffer(0, list[i].m.buf); pass.draw(list[i].m.count); }
    pass.setPipeline(pWater); pass.setBindGroup(1, bg1, [n * STRIDE]); pass.setVertexBuffer(0, water.buf); pass.draw(water.count);
    pass.end(); Q.submit([enc.finish()]);
  }
  return { resize, upload, free: (m) => m.buf.destroy(), draw, get lost() { return lost; }, device };
}
