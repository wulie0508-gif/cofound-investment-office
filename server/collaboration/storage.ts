import fs from "node:fs";
import path from "node:path";
import { getDatabase } from "../local/database";

export interface PrivateObjectStorage {
  putFile(
    publicationId: string,
    fileId: string,
    sourcePath: string,
    originalName: string
  ): Promise<string>;
  resolveObject(objectKey: string): string;
}

function safeName(value: string) {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 160) || "document";
}

class LocalPrivateObjectStorage implements PrivateObjectStorage {
  private root() {
    return path.join(getDatabase().dataDir, "shared-files");
  }

  async putFile(
    publicationId: string,
    fileId: string,
    sourcePath: string,
    originalName: string
  ) {
    const relative = path.join(
      publicationId,
      `${fileId}-${safeName(originalName)}`
    );
    const target = path.join(this.root(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await fs.promises.copyFile(sourcePath, target);
    return relative.split(path.sep).join("/");
  }

  resolveObject(objectKey: string) {
    const root = path.resolve(this.root());
    const absolute = path.resolve(root, objectKey);
    if (absolute !== root && !absolute.startsWith(root + path.sep))
      throw new Error("非法共享对象路径");
    return absolute;
  }
}

export const privateObjectStorage: PrivateObjectStorage =
  new LocalPrivateObjectStorage();
