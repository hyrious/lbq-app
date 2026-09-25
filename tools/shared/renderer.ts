import type { IpcBridge, RpcRequest, RpcResponse } from '../../src/platform/ipc/common/ipc.ts';

declare global {
  interface Window {
    readonly portal: IpcBridge;
  }
}

type RpcName<T> = Extract<keyof T, string>;

type Invoke<Rpc> = <K extends RpcName<Rpc>>(
  method: K,
  input: RpcRequest<Rpc[K]>
) => Promise<RpcResponse<Rpc[K]>>;

export function createInvoke<Rpc>(): Invoke<Rpc> {
  return async (method, input) => {
    const result = await window.portal.invoke(method, input);
    return result as RpcResponse<Rpc[typeof method]>;
  };
}

export function getElement<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function showToast(message: string, tone: 'info' | 'error' = 'info'): void {
  const toast = element('div', `toast ${tone}`, message);
  const region = document.getElementById('toasts') ?? document.body;
  region.append(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 2400);
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1024 ? `${mb.toFixed(mb < 100 ? 1 : 0)} MB` : `${(mb / 1024).toFixed(2)} GB`;
}
