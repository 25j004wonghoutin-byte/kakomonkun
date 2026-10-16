import assert from "node:assert/strict";
import test from "node:test";
let crop = {};
try { crop = await import("../src/lib/avatars/crop.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
test("avatar crop uses a cover-fit square and zooms around the image centre", () => {
  assert.equal(typeof crop.avatarSourceRect, "function");
  assert.deepEqual(crop.avatarSourceRect(1000, 500, { zoom: 1, x: 0, y: 0 }), { sx: 250, sy: 0, sw: 500, sh: 500 });
  assert.deepEqual(crop.avatarSourceRect(1000, 500, { zoom: 2, x: 0, y: 0 }), { sx: 375, sy: 125, sw: 250, sh: 250 });
});
test("avatar crop clamps pans and zoom without exposing empty image edges", () => {
  assert.equal(typeof crop.clampAvatarCrop, "function");
  for (const [w,h] of [[1000,500],[500,1000],[1,1],[2,3]]) for (const zoom of [-1,1,2,3,9]) for (const x of [-100,0,100]) {
    const state = crop.clampAvatarCrop(w,h,{zoom,x,y:-x}); const r=crop.avatarSourceRect(w,h,state);
    assert.ok(state.zoom>=1&&state.zoom<=3); assert.ok(r.sx>=0&&r.sy>=0);
    assert.ok(r.sx+r.sw<=w+1e-9&&r.sy+r.sh<=h+1e-9); assert.equal(r.sw,r.sh);
  }
});
