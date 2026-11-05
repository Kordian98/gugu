/**
 * One exchange per active link, including effect replays. New links queue behind an in-flight
 * exchange because verify also applies its session; an older response must not overwrite a newer
 * session. Subscribers can detach on route changes without repeating a single-use token exchange.
 */
export function createTokenVerification<T>() {
  let attempt: { token: string; result: Promise<T> } | null = null;
  return {
    subscribe(
      token: string,
      exchange: () => Promise<T>,
      callbacks: { onSuccess: (session: T) => void; onError: () => void },
    ) {
      if (attempt?.token !== token) {
        const result = attempt
          ? attempt.result.then(exchange, exchange)
          : Promise.resolve().then(exchange);
        attempt = { token, result };
      }
      let active = true;
      void attempt.result.then(
        (session) => {
          if (active) callbacks.onSuccess(session);
        },
        () => {
          if (active) callbacks.onError();
        },
      );
      return () => {
        active = false;
      };
    },
  };
}
