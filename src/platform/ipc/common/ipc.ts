export interface RpcMethod<I, O> {
  readonly _request: I;
  readonly _response: O;
}

export type RpcRequest<T> = T extends RpcMethod<infer I, infer _O> ? I : never;
export type RpcResponse<T> = T extends RpcMethod<infer _I, infer O> ? O : never;

export interface IpcBridge {
  readonly platform: NodeJS.Platform;
  invoke(method: string, input: unknown): Promise<unknown>;
  getPathForFile(file: File): string;
}
