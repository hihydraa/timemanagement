/** R2Bucket ขั้นต่ำในหน่วยความจำสำหรับ test */
export class FakeR2 {
  store = new Map<string, { data: ArrayBuffer; contentType?: string }>();
  failDeleteOnce = false;

  async put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
    this.store.set(key, { data: value, contentType: opts?.httpMetadata?.contentType });
    return {};
  }
  async get(key: string) {
    const o = this.store.get(key);
    if (!o) return null;
    return { body: new Response(o.data).body, httpMetadata: { contentType: o.contentType } };
  }
  async delete(keys: string | string[]) {
    if (this.failDeleteOnce) {
      this.failDeleteOnce = false;
      throw new Error('r2 down');
    }
    for (const k of Array.isArray(keys) ? keys : [keys]) this.store.delete(k);
  }
  keys() {
    return [...this.store.keys()];
  }
}
