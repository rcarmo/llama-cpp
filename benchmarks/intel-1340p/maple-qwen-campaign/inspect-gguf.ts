#!/usr/bin/env bun

const typeNames: Record<number, string> = {
  0: "F32", 1: "F16", 2: "Q4_0", 3: "Q4_1", 6: "Q5_0", 7: "Q5_1", 8: "Q8_0", 9: "Q8_1",
  10: "Q2_K", 11: "Q3_K", 12: "Q4_K", 13: "Q5_K", 14: "Q6_K", 15: "Q8_K", 16: "IQ2_XXS", 17: "IQ2_XS",
  18: "IQ3_XXS", 19: "IQ1_S", 20: "IQ4_NL", 21: "IQ3_S", 22: "IQ2_S", 23: "IQ4_XS", 24: "I8", 25: "I16",
  26: "I32", 27: "I64", 28: "F64", 29: "IQ1_M", 30: "BF16", 34: "TQ1_0", 35: "TQ2_0", 39: "MXFP4", 40: "NVFP4",
  41: "Q2_0", 42: "Q1_0", 43: "TURBO2_0", 44: "TURBO3_0", 45: "TURBO4_0", 46: "TQ3_1S", 47: "TQ4_1S",
};

class Cursor {
  offset = 0;
  constructor(readonly view: DataView, readonly bytes: Uint8Array) {}
  u8() { const v = this.view.getUint8(this.offset); this.offset += 1; return v; }
  i8() { const v = this.view.getInt8(this.offset); this.offset += 1; return v; }
  u16() { const v = this.view.getUint16(this.offset, true); this.offset += 2; return v; }
  i16() { const v = this.view.getInt16(this.offset, true); this.offset += 2; return v; }
  u32() { const v = this.view.getUint32(this.offset, true); this.offset += 4; return v; }
  i32() { const v = this.view.getInt32(this.offset, true); this.offset += 4; return v; }
  u64() { const v = this.view.getBigUint64(this.offset, true); this.offset += 8; return v; }
  i64() { const v = this.view.getBigInt64(this.offset, true); this.offset += 8; return v; }
  f32() { const v = this.view.getFloat32(this.offset, true); this.offset += 4; return v; }
  f64() { const v = this.view.getFloat64(this.offset, true); this.offset += 8; return v; }
  string() {
    const n = Number(this.u64());
    const value = new TextDecoder().decode(this.bytes.subarray(this.offset, this.offset + n));
    this.offset += n;
    return value;
  }
}

function skipValue(c: Cursor, type: number): void {
  switch (type) {
    case 0: case 1: case 7: c.offset += 1; return;
    case 2: case 3: c.offset += 2; return;
    case 4: case 5: case 6: c.offset += 4; return;
    case 8: c.string(); return;
    case 9: {
      const elementType = c.u32();
      const count = Number(c.u64());
      for (let i = 0; i < count; i++) skipValue(c, elementType);
      return;
    }
    case 10: case 11: case 12: c.offset += 8; return;
    default: throw new Error(`unknown GGUF metadata type ${type}`);
  }
}

for (const path of process.argv.slice(2)) {
  const file = Bun.file(path);
  const data = await file.slice(0, 16 * 1024 * 1024).arrayBuffer();
  const bytes = new Uint8Array(data);
  const c = new Cursor(new DataView(data), bytes);
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  c.offset = 4;
  if (magic !== "GGUF") throw new Error(`${path}: bad magic ${magic}`);
  const version = c.u32();
  const tensorCount = Number(c.u64());
  const kvCount = Number(c.u64());
  for (let i = 0; i < kvCount; i++) {
    c.string();
    skipValue(c, c.u32());
  }
  const counts = new Map<string, number>();
  const keys: Record<string, { type: string; shape: string[] }> = {};
  const routerTypes = new Map<string, number>();
  for (let i = 0; i < tensorCount; i++) {
    const name = c.string();
    const dimensions = c.u32();
    const shape = Array.from({ length: dimensions }, () => c.u64().toString());
    const typeId = c.u32();
    c.u64();
    const type = typeNames[typeId] ?? `TYPE_${typeId}`;
    counts.set(type, (counts.get(type) ?? 0) + 1);
    if (["token_embd.weight", "output.weight", "output_norm.weight"].includes(name)) keys[name] = { type, shape };
    if (name.includes("ffn_gate_inp.weight")) routerTypes.set(type, (routerTypes.get(type) ?? 0) + 1);
  }
  console.log(JSON.stringify({
    path,
    file_size: file.size,
    version,
    tensor_count: tensorCount,
    kv_count: kvCount,
    types: Object.fromEntries([...counts].sort()),
    key_tensors: keys,
    router_types: Object.fromEntries([...routerTypes].sort()),
  }));
}
