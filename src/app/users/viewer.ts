import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";

// レイアウトとページで同じリクエストの認証結果を共有する。
export const getPublicProfileViewer = cache(getCurrentUser);
