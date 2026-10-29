`retry` in `src/retry.ts` should call `fn` up to `attempts` times and resolve with the first successful result, waiting `delayMs` between attempts (not after the last one). A failure is either a rejected promise or `fn` throwing synchronously. If every attempt fails it must reject with the error from the last attempt. `attempts` below 1 must make it reject with a `RangeError`.

Right now it gives up immediately when `fn` returns a rejected promise, and it makes too few attempts. Fix it without changing the signature.
