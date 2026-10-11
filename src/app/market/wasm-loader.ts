export interface GeneratorExports {
  memory: WebAssembly.Memory;
  init(instrumentCount: number, seed: number): void;
  generateBatch(count: number): number;
  getBatchPointer(): number;
  getBatchCapacity(): number;
  getFieldCount(): number;
  getMidCents(index: number): number;
}

export const wasmImports: WebAssembly.Imports = {
  env: {
    abort: (_msg: number, _file: number, line: number, col: number): never => {
      throw new Error(`WASM abort at ${line}:${col}`);
    },
  },
};

export async function instantiateGenerator(bytes: BufferSource): Promise<GeneratorExports> {
  const { instance } = await WebAssembly.instantiate(bytes, wasmImports);
  return instance.exports as unknown as GeneratorExports;
}

export async function loadGenerator(url: string): Promise<GeneratorExports> {
  const res = await fetch(url, { cache: 'no-cache' }).catch((e: unknown) => {
    throw new Error(`Cannot load ${url}: ${e instanceof Error ? e.message : String(e)}`);
  });

  if (!res.ok) {
    throw new Error(`Cannot load ${url}: HTTP ${res.status}`);
  }

  if (res.headers.get('content-type')?.startsWith('text/html')) {
    throw new Error(`Cannot load ${url}: not found (server returned index.html)`);
  }

  const bytes: BufferSource = await res.arrayBuffer();

  return instantiateGenerator(bytes);
}

export function readBatch(g: GeneratorExports, n: number): Int32Array {
  return new Int32Array(g.memory.buffer, g.getBatchPointer(), n * g.getFieldCount());
}
