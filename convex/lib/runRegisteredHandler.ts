export function runRegisteredHandler<T>(
  registered: unknown,
  ctx: any,
  args: any
): Promise<T> {
  const handler = (
    registered as {
      _handler: (ctx: any, args: any) => Promise<T>;
    }
  )._handler;
  return handler(ctx, args);
}
