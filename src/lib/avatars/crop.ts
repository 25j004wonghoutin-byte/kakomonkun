export type CropState = { zoom: number; x: number; y: number };
export const INITIAL_AVATAR_CROP: CropState = { zoom: 1, x: 0, y: 0 };

export function clampAvatarCrop(width: number, height: number, state: CropState): CropState {
  if (!(width > 0) || !(height > 0)) throw new Error("Invalid image dimensions");
  const zoom = Math.max(1, Math.min(3, Number.isFinite(state.zoom) ? state.zoom : 1));
  const side = Math.min(width, height) / zoom;
  const x = Math.max(-(width - side) / (2 * side), Math.min((width - side) / (2 * side), Number.isFinite(state.x) ? state.x : 0));
  const y = Math.max(-(height - side) / (2 * side), Math.min((height - side) / (2 * side), Number.isFinite(state.y) ? state.y : 0));
  return { zoom, x, y };
}

export function avatarSourceRect(width: number, height: number, state: CropState) {
  const crop = clampAvatarCrop(width, height, state);
  const side = Math.min(width, height) / crop.zoom;
  return { sx: Math.max(0, (width - side) / 2 - crop.x * side), sy: Math.max(0, (height - side) / 2 - crop.y * side), sw: side, sh: side };
}
