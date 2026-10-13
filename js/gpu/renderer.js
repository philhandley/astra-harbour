// The WebGPU renderer. Passes each frame:
//   shadow map -> caustics -> opaque scene (MSAA, a = view distance, resolved to sceneTex)
//   -> water back faces (distance) -> water + sprites over sceneTex (resolved to finalTex) -> tone map to the canvas.
import { PRELUDE, LIGHTING, PROPS, INST, BACKDROP, CAUSTICS, WATER_COMMON, WATER_BACK, WATER_FRONT, SPRITES, TONEMAP } from './shaders.js';
import { mat4, v3 } from './math.js';

const FRAME_FLOATS = 388;           // see the Frame struct in shaders.js
const MAX_INST = 12000;
const INST_STRIDE = 48;
const MAX_SPRITES = 3000;
const SPRITE_STRIDE = 24;
const SHADOW_SIZE = 2048;
const CAUS_SIZE = 512;

export const OFS = { viewProj: 0, invViewProj: 16, lightViewProj: 32, tilt: 48, camPos: 64, lightDir: 68, jelly: 72, screen: 76, waterA: 80, waterB: 84, waterC: 88, misc: 92, sim: 96, strata: 100, objects: 132 };

export async function createRenderer(canvas, opts = {}) {
  if (!('gpu' in navigator)) throw new Error('no-webgpu');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no-adapter');
  const device = await adapter.requestDevice();
  const errors = [];
  device.addEventListener('uncapturederror', e => { errors.push(e.error.message); console.error('GPU', e.error.message); });
  device.lost.then(info => { if (opts.onLost) opts.onLost(info); });

  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const N = opts.simN || 128;
  const sampleCount = opts.msaa === false ? 1 : 4;

  // ---- resources ----------------------------------------------------------------------------
  const frameBuf = device.createBuffer({ size: FRAME_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const frame = new Float32Array(FRAME_FLOATS);
  const tmBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const simTex = device.createTexture({ size: [N, N], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  const terTex = device.createTexture({ size: [N, N], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  const shadowTex = device.createTexture({ size: [SHADOW_SIZE, SHADOW_SIZE], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  const causTex = device.createTexture({ size: [CAUS_SIZE, CAUS_SIZE], format: 'r16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  const cmpSamp = device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
  const linSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

  const instBuf = device.createBuffer({ size: MAX_INST * INST_STRIDE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const spriteBuf = device.createBuffer({ size: MAX_SPRITES * SPRITE_STRIDE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

  // ---- bind group layouts --------------------------------------------------------------------
  const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const entA = [
    { binding: 0, visibility: VF, buffer: { type: 'uniform' } },
    { binding: 1, visibility: VF, texture: { sampleType: 'unfilterable-float' } },
    { binding: 2, visibility: VF, texture: { sampleType: 'unfilterable-float' } },
  ];
  const entB = [...entA,
    { binding: 3, visibility: VF, texture: { sampleType: 'depth' } },
    { binding: 4, visibility: VF, sampler: { type: 'comparison' } },
    { binding: 5, visibility: VF, texture: { sampleType: 'float' } },
    { binding: 6, visibility: VF, sampler: { type: 'filtering' } },
  ];
  const entC = [...entB,
    { binding: 7, visibility: VF, texture: { sampleType: 'float' } },
    { binding: 8, visibility: VF, texture: { sampleType: 'float' } },
  ];
  const bglA = device.createBindGroupLayout({ entries: entA });
  const bglB = device.createBindGroupLayout({ entries: entB });
  const bglC = device.createBindGroupLayout({ entries: entC });
  const bglT = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
  ] });
  const plA = device.createPipelineLayout({ bindGroupLayouts: [bglA] });
  const plB = device.createPipelineLayout({ bindGroupLayouts: [bglB] });
  const plC = device.createPipelineLayout({ bindGroupLayouts: [bglC] });
  const plT = device.createPipelineLayout({ bindGroupLayouts: [bglT] });

  const resA = [
    { binding: 0, resource: { buffer: frameBuf } },
    { binding: 1, resource: simTex.createView() },
    { binding: 2, resource: terTex.createView() },
  ];
  const resB = [...resA,
    { binding: 3, resource: shadowTex.createView() },
    { binding: 4, resource: cmpSamp },
    { binding: 5, resource: causTex.createView() },
    { binding: 6, resource: linSamp },
  ];
  const groupA = device.createBindGroup({ layout: bglA, entries: resA });
  const groupB = device.createBindGroup({ layout: bglB, entries: resB });

  // ---- shader modules -------------------------------------------------------------------------
  const mod = (name, code) => {
    const m = device.createShaderModule({ label: name, code });
    m.getCompilationInfo().then(info => {
      for (const msg of info.messages) if (msg.type === 'error') console.error(`WGSL ${name}:${msg.lineNum}:${msg.linePos} ${msg.message}`);
    });
    return m;
  };
  const mProps = mod('props', PRELUDE + LIGHTING + PROPS);
  const mInst = mod('inst', PRELUDE + LIGHTING + INST);
  const mBack = mod('backdrop', PRELUDE + LIGHTING + BACKDROP);
  const mCaus = mod('caustics', PRELUDE + CAUSTICS);
  const mWaterBack = mod('waterBack', PRELUDE + WATER_COMMON + WATER_BACK);
  const mWater = mod('water', PRELUDE + LIGHTING + WATER_COMMON + WATER_FRONT);
  const mSprites = mod('sprites', PRELUDE + LIGHTING + SPRITES);
  const mTone = mod('tonemap', TONEMAP);

  // ---- vertex layouts -------------------------------------------------------------------------
  const vMesh = { arrayStride: 32, attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'unorm8x4' },
    { shaderLocation: 3, offset: 28, format: 'uint8x4' },
  ] };
  const vInst = { arrayStride: INST_STRIDE, stepMode: 'instance', attributes: [
    { shaderLocation: 4, offset: 0, format: 'float32x3' },
    { shaderLocation: 5, offset: 12, format: 'float32' },
    { shaderLocation: 6, offset: 16, format: 'float32x4' },
    { shaderLocation: 7, offset: 32, format: 'unorm8x4' },
    { shaderLocation: 8, offset: 36, format: 'uint8x4' },
    { shaderLocation: 9, offset: 40, format: 'float32x2' },
  ] };
  const vWater = { arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] };
  const vGrid = { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] };
  const vSprite = { arrayStride: SPRITE_STRIDE, stepMode: 'instance', attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32' },
    { shaderLocation: 2, offset: 16, format: 'unorm8x4' },
    { shaderLocation: 3, offset: 20, format: 'uint8x4' },
  ] };

  const HDR = 'rgba16float';
  const DEPTH = 'depth24plus';
  const ms = { count: sampleCount };
  const depthLess = { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' };

  // ---- pipelines ------------------------------------------------------------------------------
  const pShadowProps = device.createRenderPipeline({ label: 'shadowProps', layout: plB,
    vertex: { module: mProps, entryPoint: 'vsShadow', buffers: [vMesh] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.0 } });
  const pShadowInst = device.createRenderPipeline({ label: 'shadowInst', layout: plB,
    vertex: { module: mInst, entryPoint: 'vsShadow', buffers: [vMesh, vInst] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.0 } });
  const pCaus = device.createRenderPipeline({ label: 'caustics', layout: plA,
    vertex: { module: mCaus, entryPoint: 'vs', buffers: [vGrid] },
    fragment: { module: mCaus, entryPoint: 'fs', targets: [{ format: 'r16float', blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' } });
  const pBackdrop = device.createRenderPipeline({ label: 'backdrop', layout: plB,
    vertex: { module: mBack, entryPoint: 'vsFull' },
    fragment: { module: mBack, entryPoint: 'fsBack', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list' }, multisample: ms,
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' } });
  const pFloor = device.createRenderPipeline({ label: 'floor', layout: plB,
    vertex: { module: mBack, entryPoint: 'vsFloor' },
    fragment: { module: mBack, entryPoint: 'fsFloor', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: ms, depthStencil: depthLess });
  const pProps = device.createRenderPipeline({ label: 'props', layout: plB,
    vertex: { module: mProps, entryPoint: 'vs', buffers: [vMesh] },
    fragment: { module: mProps, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: ms, depthStencil: depthLess });
  const pInst = device.createRenderPipeline({ label: 'inst', layout: plB,
    vertex: { module: mInst, entryPoint: 'vs', buffers: [vMesh, vInst] },
    fragment: { module: mInst, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: ms, depthStencil: depthLess });
  const pWaterBack = device.createRenderPipeline({ label: 'waterBack', layout: plA,
    vertex: { module: mWaterBack, entryPoint: 'vsWater', buffers: [vWater] },
    fragment: { module: mWaterBack, entryPoint: 'fsBack', targets: [{ format: 'r16float' }] },
    primitive: { topology: 'triangle-list', cullMode: 'front' },
    depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' } });
  const pWater = device.createRenderPipeline({ label: 'water', layout: plC,
    vertex: { module: mWater, entryPoint: 'vsWater', buffers: [vWater] },
    fragment: { module: mWater, entryPoint: 'fsWater', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' }, multisample: ms, depthStencil: depthLess });
  const pSprites = device.createRenderPipeline({ label: 'sprites', layout: plC,
    vertex: { module: mSprites, entryPoint: 'vs', buffers: [vSprite] },
    fragment: { module: mSprites, entryPoint: 'fs', targets: [{ format: HDR, blend: {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'zero', dstFactor: 'one' } } }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: ms,
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' } });
  const pTone = device.createRenderPipeline({ label: 'tonemap', layout: plT,
    vertex: { module: mTone, entryPoint: 'vs' },
    fragment: { module: mTone, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' } });

  // ---- static geometry: caustics grid and water mesh -------------------------------------------
  const CG = opts.causticGrid || 200;
  const gridBuf = (() => {
    const v = new Float32Array(CG * CG * 6 * 2);
    let k = 0;
    for (let j = 0; j < CG; j++) for (let i = 0; i < CG; i++) {
      const x0 = -1 + (2 * i) / CG, x1 = -1 + (2 * (i + 1)) / CG, z0 = -1 + (2 * j) / CG, z1 = -1 + (2 * (j + 1)) / CG;
      v.set([x0, z0, x1, z0, x1, z1, x0, z0, x1, z1, x0, z1], k); k += 12;
    }
    const b = device.createBuffer({ size: v.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, v);
    return b;
  })();

  let water = null; // { vbuf, ibuf, count }
  function setWaterMesh(m) {
    const vb = device.createBuffer({ size: m.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vb, 0, m.vertices);
    const ib = device.createBuffer({ size: m.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ib, 0, m.indices);
    water = { vbuf: vb, ibuf: ib, count: m.indices.length };
  }

  let props = null;
  function setStatic(m) {
    const vb = device.createBuffer({ size: Math.max(m.vertices.byteLength, 32), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vb, 0, m.vertices);
    const ib = device.createBuffer({ size: Math.max(m.indices.byteLength, 4), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ib, 0, m.indices);
    if (props) { props.vbuf.destroy(); props.ibuf.destroy(); }
    props = { vbuf: vb, ibuf: ib, count: m.indices.length };
  }

  // Instanced templates: one shared vertex/index buffer. templates[name] = { firstIndex, indexCount, baseVertex }
  let tpl = null;
  const templates = {};
  function setTemplates(list) {
    // list: [{ name, mesh }] where mesh is a MeshBuilder.finish() result
    let nv = 0, ni = 0;
    for (const t of list) { nv += t.mesh.nv; ni += t.mesh.indices.length; }
    const vdata = new Uint8Array(nv * 32), idata = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const t of list) {
      vdata.set(t.mesh.vertices, vo * 32);
      idata.set(t.mesh.indices, io);
      templates[t.name] = { firstIndex: io, indexCount: t.mesh.indices.length, baseVertex: vo };
      vo += t.mesh.nv; io += t.mesh.indices.length;
    }
    const vb = device.createBuffer({ size: Math.max(vdata.byteLength, 32), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vb, 0, vdata);
    const ib = device.createBuffer({ size: Math.max(idata.byteLength, 4), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ib, 0, idata);
    tpl = { vbuf: vb, ibuf: ib };
  }

  // ---- size-dependent targets ----------------------------------------------------------------
  let W = 0, H = 0, msaaColor, msaaDepth, sceneTex, finalTex, backTex, backDepth, groupC, groupT;
  function resize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = w; canvas.height = h;
    for (const t of [msaaColor, msaaDepth, sceneTex, finalTex, backTex, backDepth]) if (t) t.destroy();
    const RA = GPUTextureUsage.RENDER_ATTACHMENT, TB = GPUTextureUsage.TEXTURE_BINDING;
    msaaColor = device.createTexture({ size: [w, h], format: HDR, sampleCount, usage: RA });
    msaaDepth = device.createTexture({ size: [w, h], format: DEPTH, sampleCount, usage: RA });
    sceneTex = device.createTexture({ size: [w, h], format: HDR, usage: RA | TB });
    finalTex = device.createTexture({ size: [w, h], format: HDR, usage: RA | TB });
    backTex = device.createTexture({ size: [w, h], format: 'r16float', usage: RA | TB });
    backDepth = device.createTexture({ size: [w, h], format: DEPTH, usage: RA });
    groupC = device.createBindGroup({ layout: bglC, entries: [...resB,
      { binding: 7, resource: sceneTex.createView() },
      { binding: 8, resource: backTex.createView() }] });
    groupT = device.createBindGroup({ layout: bglT, entries: [
      { binding: 0, resource: finalTex.createView() },
      { binding: 1, resource: { buffer: tmBuf } }] });
  }

  // ---- uploads ---------------------------------------------------------------------------------
  function uploadSim(data) { device.queue.writeTexture({ texture: simTex }, data, { bytesPerRow: N * 16 }, [N, N]); }
  function uploadTerrain(data) { device.queue.writeTexture({ texture: terTex }, data, { bytesPerRow: N * 16 }, [N, N]); }

  // ---- camera ------------------------------------------------------------------------------------
  // cam: { eye, target, fov, shiftX, shiftY }
  function cameraMatrices(cam) {
    const view = mat4.lookAt(cam.eye, cam.target);
    const proj = mat4.perspective(cam.fov, W / H, 0.05, 60, cam.shiftX || 0, cam.shiftY || 0);
    const vp = mat4.mul(proj, view);
    return { view, proj, vp, inv: mat4.invert(vp) };
  }

  function lightMatrix(L) {
    const c = [0.3, -0.2, -0.3];
    const eye = v3.add(c, v3.scale(L, 9));
    const view = mat4.lookAt(eye, c, Math.abs(L[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0]);
    const proj = mat4.ortho(-4.6, 4.6, -4.0, 4.0, 1, 20);
    return mat4.mul(proj, view);
  }

  // ---- per-frame draw --------------------------------------------------------------------------
  // s: { cam, time, sea, light, tilt(mat4), jelly[4], water{A,B,C}, misc[4], strata[8][3], objects Float32Array(256),
  //      instances: [{ template, data: ArrayBuffer(Float32 view), count }], sprites: { data, count }, exposure }
  let lastCam = null;
  function draw(s) {
    if (!W) return;
    const cm = cameraMatrices(s.cam);
    lastCam = cm;
    const L = v3.norm(s.light);
    frame.set(cm.vp, OFS.viewProj);
    frame.set(cm.inv, OFS.invViewProj);
    frame.set(lightMatrix(L), OFS.lightViewProj);
    frame.set(s.tilt, OFS.tilt);
    frame.set([s.cam.eye[0], s.cam.eye[1], s.cam.eye[2], s.time], OFS.camPos);
    frame.set([L[0], L[1], L[2], s.sea], OFS.lightDir);
    frame.set(s.jelly, OFS.jelly);
    frame.set([W, H, 1 / W, 1 / H], OFS.screen);
    frame.set(s.water.A, OFS.waterA);
    frame.set(s.water.B, OFS.waterB);
    frame.set(s.water.C, OFS.waterC);
    frame.set(s.misc, OFS.misc);
    frame.set([-2.6, -2.6, 5.2 / N, N], OFS.sim);
    for (let i = 0; i < 8; i++) frame.set([...s.strata[i], 1], OFS.strata + i * 4);
    frame.set(s.objects, OFS.objects);
    device.queue.writeBuffer(frameBuf, 0, frame);
    device.queue.writeBuffer(tmBuf, 0, new Float32Array([s.exposure || 1, s.time % 100, 0, 0]));

    // instances
    const draws = [];
    let io = 0;
    if (tpl) for (const g of s.instances) {
      if (!g.count || !templates[g.template]) continue;
      const n = Math.min(g.count, MAX_INST - io);
      if (n <= 0) break;
      device.queue.writeBuffer(instBuf, io * INST_STRIDE, g.data, 0, n * INST_STRIDE);
      draws.push({ t: templates[g.template], first: io, n, shadow: g.shadow !== false });
      io += n;
    }
    let ns = 0;
    if (s.sprites && s.sprites.count) {
      ns = Math.min(s.sprites.count, MAX_SPRITES);
      device.queue.writeBuffer(spriteBuf, 0, s.sprites.data, 0, ns * SPRITE_STRIDE);
    }

    const enc = device.createCommandEncoder();

    // 1. shadow map
    {
      const pass = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: shadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      pass.setBindGroup(0, groupB_shadowSafe());
      if (props) { pass.setPipeline(pShadowProps); pass.setVertexBuffer(0, props.vbuf); pass.setIndexBuffer(props.ibuf, 'uint32'); pass.drawIndexed(props.count); }
      if (tpl && draws.length) {
        pass.setPipeline(pShadowInst); pass.setVertexBuffer(0, tpl.vbuf); pass.setVertexBuffer(1, instBuf); pass.setIndexBuffer(tpl.ibuf, 'uint32');
        for (const d of draws) if (d.shadow) pass.drawIndexed(d.t.indexCount, d.n, d.t.firstIndex, d.t.baseVertex, d.first);
      }
      pass.end();
    }
    // 2. caustics
    {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: causTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      pass.setPipeline(pCaus); pass.setBindGroup(0, groupA); pass.setVertexBuffer(0, gridBuf); pass.draw(CG * CG * 6);
      pass.end();
    }
    // 3. opaque scene
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: msaaColor.createView(), resolveTarget: sceneTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0.8, 0.78, 0.74, 9000] }],
        depthStencilAttachment: { view: msaaDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      pass.setBindGroup(0, groupB);
      pass.setPipeline(pBackdrop); pass.draw(3);
      pass.setPipeline(pFloor); pass.draw(6);
      if (props) { pass.setPipeline(pProps); pass.setVertexBuffer(0, props.vbuf); pass.setIndexBuffer(props.ibuf, 'uint32'); pass.drawIndexed(props.count); }
      if (tpl && draws.length) {
        pass.setPipeline(pInst); pass.setVertexBuffer(0, tpl.vbuf); pass.setVertexBuffer(1, instBuf); pass.setIndexBuffer(tpl.ibuf, 'uint32');
        for (const d of draws) pass.drawIndexed(d.t.indexCount, d.n, d.t.firstIndex, d.t.baseVertex, d.first);
      }
      pass.end();
    }
    // 4. water back faces
    if (water) {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: backTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [9000, 0, 0, 0] }],
        depthStencilAttachment: { view: backDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      pass.setPipeline(pWaterBack); pass.setBindGroup(0, groupA); pass.setVertexBuffer(0, water.vbuf); pass.setIndexBuffer(water.ibuf, 'uint32'); pass.drawIndexed(water.count);
      pass.end();
    }
    // 5. water and sprites over the scene
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: msaaColor.createView(), resolveTarget: finalTex.createView(), loadOp: 'load', storeOp: 'discard' }],
        depthStencilAttachment: { view: msaaDepth.createView(), depthLoadOp: 'load', depthStoreOp: 'discard' } });
      pass.setBindGroup(0, groupC);
      if (water) { pass.setPipeline(pWater); pass.setVertexBuffer(0, water.vbuf); pass.setIndexBuffer(water.ibuf, 'uint32'); pass.drawIndexed(water.count); }
      if (ns) { pass.setPipeline(pSprites); pass.setVertexBuffer(0, spriteBuf); pass.draw(6, ns); }
      pass.end();
    }
    // 6. tone map
    {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }] });
      pass.setPipeline(pTone); pass.setBindGroup(0, groupT); pass.draw(3);
      pass.end();
    }
    device.queue.submit([enc.finish()]);
  }

  // The shadow pass may not sample the shadow map it writes; give it a group B whose shadow slot is a dummy depth texture.
  let groupBShadow = null;
  function groupB_shadowSafe() {
    if (!groupBShadow) {
      const dummy = device.createTexture({ size: [1, 1], format: 'depth32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      groupBShadow = device.createBindGroup({ layout: bglB, entries: resB.map(e => (e.binding === 3 ? { binding: 3, resource: dummy.createView() } : e)) });
    }
    return groupBShadow;
  }

  return {
    device, adapter, N, errors,
    resize, draw, setStatic, setTemplates, setWaterMesh, uploadSim, uploadTerrain,
    get size() { return [W, H]; },
    get camera() { return lastCam; },
    cameraMatrices,
    MAX_INST,
  };
}
