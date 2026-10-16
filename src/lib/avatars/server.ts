import { randomUUID } from "node:crypto";
import { getCurrentUser } from "../auth";
import { prisma } from "../prisma";
import { createAvatarHandlers } from "./handlers";
import { normalizeAvatarImage } from "./image";
import { createAvatarRepository } from "./repository";
import { createAvatarService } from "./service";
import { createAvatarStorage } from "./storage";
import { getAvatarStorageConfig } from "./storage-config";

export const avatarHandlers = createAvatarHandlers({
  getUser: getCurrentUser,
  normalizeImage: normalizeAvatarImage,
  service: () => createAvatarService({
    repository: createAvatarRepository(prisma),
    storage: createAvatarStorage(getAvatarStorageConfig(process.env)),
    newVersion: randomUUID,
    log: (event, ref) => console.warn("Avatar maintenance", { event, key: ref.key }),
  }),
});
