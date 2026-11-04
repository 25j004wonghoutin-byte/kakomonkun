import type { NotificationReadAllResult } from "./write";

type Dependencies = {
  getUser: () => Promise<{ id: string } | null>;
  markAllRead: (recipientId: string) => Promise<NotificationReadAllResult>;
};

export function createNotificationReadAllHandler({ getUser, markAllRead }: Dependencies) {
  return async function PATCH() {
    const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
    try {
      const user = await getUser();
      if (!user) {
        return Response.json({ error: "ログインが必要です。" }, { status: 401, headers });
      }
      const result = await markAllRead(user.id);
      return Response.json({ ...result, ownerId: user.id }, { headers });
    } catch {
      return Response.json(
        { error: "通知を既読にできませんでした。もう一度お試しください。" },
        { status: 500, headers },
      );
    }
  };
}
