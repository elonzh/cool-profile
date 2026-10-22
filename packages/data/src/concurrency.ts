export const defaultProviderConcurrency = 4;

export function limitConcurrency(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new RangeError('Expected positive concurrency');
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (running >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
    else running++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}
