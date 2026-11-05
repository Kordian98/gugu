import { describe, expect, it, vi } from "vitest";

import { createTokenVerification } from "./tokenVerification";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const callbacks = () => ({ onSuccess: vi.fn(), onError: vi.fn() });
const flush = async () => {
  for (let tick = 0; tick < 5; tick++) await Promise.resolve();
};

describe("magic-link verification lifecycle", () => {
  it("exchanges a fresh link after the previous link was rejected on the same screen", async () => {
    const verification = createTokenVerification<string>();
    const old = callbacks();
    const fresh = callbacks();
    const detach = verification.subscribe(
      "expired",
      () => Promise.reject(new Error("expired")),
      old,
    );
    await flush();
    expect(old.onError).toHaveBeenCalledOnce();
    detach();
    verification.subscribe("fresh", () => Promise.resolve("fresh-session"), fresh);
    await flush();
    expect(fresh.onSuccess).toHaveBeenCalledWith("fresh-session");
    expect(fresh.onError).not.toHaveBeenCalled();
  });

  it("reuses the exchange through effect cleanup/replay and sends results only to the live subscriber", async () => {
    const verification = createTokenVerification<string>();
    const result = deferred<string>();
    const exchange = vi.fn(() => result.promise);
    const previous = callbacks();
    const current = callbacks();
    verification.subscribe("same-token", exchange, previous)();
    verification.subscribe("same-token", exchange, current);
    await flush();
    expect(exchange).toHaveBeenCalledOnce();
    result.resolve("session");
    await flush();
    expect(previous.onSuccess).not.toHaveBeenCalled();
    expect(current.onSuccess).toHaveBeenCalledWith("session");
  });

  it("serializes session application and ignores an old success after a newer link arrives", async () => {
    const verification = createTokenVerification<string>();
    const result = deferred<string>();
    const old = callbacks();
    const fresh = callbacks();
    const freshExchange = vi.fn(() => Promise.resolve("new-session"));
    const detach = verification.subscribe("old", () => result.promise, old);
    await flush();
    detach();
    verification.subscribe("new", freshExchange, fresh);
    await flush();
    expect(freshExchange).not.toHaveBeenCalled();
    result.resolve("old-session");
    await flush();
    expect(old.onSuccess).not.toHaveBeenCalled();
    expect(freshExchange).toHaveBeenCalledOnce();
    expect(fresh.onSuccess).toHaveBeenCalledWith("new-session");
  });

  it("does not let an old rejection replace the new link's loading/success state", async () => {
    const verification = createTokenVerification<string>();
    const result = deferred<string>();
    const old = callbacks();
    const fresh = callbacks();
    const detach = verification.subscribe("old", () => result.promise, old);
    await flush();
    detach();
    verification.subscribe("new", () => Promise.resolve("new-session"), fresh);
    result.reject(new Error("expired"));
    await flush();
    expect(old.onError).not.toHaveBeenCalled();
    expect(fresh.onSuccess).toHaveBeenCalledWith("new-session");
  });
});
