// Minimal wallet store — read-only address tracking, no signing here.
// The connect button (App.tsx) calls eth_requestAccounts on the injected
// provider; pages read the address through useWallet(). No transaction is
// ever sent from this site in this build; writes (mint, coach, unlock)
// are not wired yet.
import { useSyncExternalStore } from "react";

let address: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getWalletAddress(): string | null {
  return address;
}

export function setWalletAddress(addr: string | null) {
  address = addr ? addr.toLowerCase() : null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useWallet(): string | null {
  return useSyncExternalStore(subscribe, getWalletAddress, getWalletAddress);
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
    };
  }
}

// Read-only: list already-connected accounts without prompting.
export async function detectConnectedWallet(): Promise<string | null> {
  try {
    if (!window.ethereum) return null;
    const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
    return accounts && accounts.length > 0 ? accounts[0].toLowerCase() : null;
  } catch {
    return null;
  }
}

// Prompted connect (user taps the button). Returns the address or null.
export async function connectWallet(): Promise<string | null> {
  if (!window.ethereum) return null;
  const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
  return accounts && accounts.length > 0 ? accounts[0].toLowerCase() : null;
}
