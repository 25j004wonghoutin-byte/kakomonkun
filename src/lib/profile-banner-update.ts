import { normalizeBannerColor } from "./profile-banner";

type BannerUser = { id: string; role: { name: string }; studentProfile: unknown };
export function createProfileBannerHandler(deps: {
  getUser: () => Promise<BannerUser | null>;
  updateBanner: (userId: string, color: string) => Promise<unknown>;
}) {
  return async function PATCH(request: Request) {
    const user = await deps.getUser();
    if (!user) return Response.json({ error: "ログインしてください。" }, { status: 401 });
    if (user.role.name !== "student" || !user.studentProfile) return Response.json({ error: "学生のみ変更できます。" }, { status: 403 });
    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: "入力内容を確認してください。" }, { status: 400 }); }
    const color = normalizeBannerColor(body && typeof body === "object" && "bannerColor" in body ? body.bannerColor : null);
    if (!color) return Response.json({ error: "バナーの色を選んでください。" }, { status: 400 });
    await deps.updateBanner(user.id, color);
    return Response.json({ bannerColor: color }, { headers: { "Cache-Control": "private, no-store" } });
  };
}
