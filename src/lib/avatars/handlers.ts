import { AvatarError, parseAvatarUrl } from "./contract";
import { readAvatarDelete, readAvatarUpload } from "./request";
import type { AvatarService } from "./service";

type User = {id: string; role: {name: string}; status: string; deletedAt: Date | null};
type Dependencies = {
  getUser(): Promise<User | null>;
  service: AvatarService | (() => AvatarService);
  normalizeImage(bytes: Uint8Array): Promise<Uint8Array>;
};

export const avatarHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};

export function createAvatarHandlers({ getUser, service, normalizeImage }: Dependencies) {
  const resolve = () => typeof service === "function" ? service() : service;
  async function authorize(mutation: boolean): Promise<User> {
    const user = await getUser();
    if (!user || user.status !== "active" || user.deletedAt) throw new AvatarError("unauthorized", 401, "ログインしてください。");
    const allowed = user.role.name === "student" || (!mutation && user.role.name === "teacher");
    if (!allowed) {
      throw new AvatarError("forbidden", 403, "この操作は利用できません。");
    }
    return user;
  }
  function sameOrigin(request: Request) {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AvatarError("origin", 403, "この操作は利用できません。");
  }
  async function safe(work: () => Promise<Response>): Promise<Response> {
    try { return await work(); }
    catch (cause) {
      return Response.json({ error: cause instanceof AvatarError ? cause.message : "画像を処理できませんでした。しばらくしてからお試しください。" }, {
        status: cause instanceof AvatarError ? cause.status : 500, headers: avatarHeaders,
      });
    }
  }
  return {
    post(request: Request) {
      return safe(async () => {
        const user = await authorize(true);
        sameOrigin(request);
        const input = await readAvatarUpload(request);
        const image = await normalizeImage(input.image);
        const result = await resolve().save({ userId: user.id, expectedAvatarUrl: input.expectedAvatarUrl, image });
        return Response.json(result, { headers: avatarHeaders });
      });
    },
    remove(request: Request) {
      return safe(async () => {
        const user = await authorize(true);
        sameOrigin(request);
        const input = await readAvatarDelete(request);
        return Response.json(await resolve().remove({ userId: user.id, ...input }), { headers: avatarHeaders });
      });
    },
    async image(request: Request, params: {userId: string; version: string}) {
      const response = await safe(async () => {
        await authorize(false);
        const ref = parseAvatarUrl(`/api/avatars/${params.userId}/${params.version}`);
        const bytes = ref ? await resolve().read(ref) : null;
        if (!bytes) throw new AvatarError("not_found", 404, "画像が見つかりません。");
        return new Response(new Uint8Array(bytes), { headers: {
          ...avatarHeaders, "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff",
        } });
      });
      return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
    },
  };
}
