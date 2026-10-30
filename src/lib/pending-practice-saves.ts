"use client";

// Only in-flight browser operations are held; completed answers are never cached here.
const pendingSaves = new Set<Promise<unknown>>();

export function trackPracticeSave<T>(save: () => Promise<T>): Promise<T> {
  const operation = Promise.resolve().then(save);
  pendingSaves.add(operation);
  const release = () => { pendingSaves.delete(operation); };
  void operation.then(release, release);
  return operation;
}

export async function waitForPracticeSaves(): Promise<void> {
  while (pendingSaves.size > 0) {
    await Promise.allSettled([...pendingSaves]);
  }
}
