import { useEffect, useState } from "react";
import { DEPLOYED, CONTRACT_ADDRESS, AGENT_ID_REGISTRY, CHAIN_ID } from "./config";
import { useWallet, setWalletAddress, detectConnectedWallet, connectWallet } from "./wallet";
import Home from "./pages/Home";
import MyPlayer from "./pages/MyPlayer";
import Training from "./pages/Training";
import Market from "./pages/Market";
import League from "./pages/League";
import Clubs from "./pages/Clubs";
import Live from "./pages/Live";
import Duels from "./pages/Duels";

const ROUTES = [
  { hash: "#/", label: "Stadium", page: <Home /> },
  { hash: "#/player", label: "My Player", page: <MyPlayer /> },
  { hash: "#/training", label: "Training Ground", page: <Training /> },
  { hash: "#/market", label: "Supermarket", page: <Market /> },
  { hash: "#/league", label: "League", page: <League /> },
  { hash: "#/clubs", label: "Clubs", page: <Clubs /> },
  { hash: "#/live", label: "Live Match Center", page: <Live /> },
  { hash: "#/duels", label: "Duels / Arena", page: <Duels /> },
] as const;

function routeFor(hash: string) {
  return ROUTES.find((r) => r.hash === hash) ?? ROUTES[0];
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  const [walletNote, setWalletNote] = useState("");
  const wallet = useWallet();
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  // Read-only auto-detect: if the browser wallet is already connected,
  // pick the address up without prompting. No transaction is sent.
  useEffect(() => {
    detectConnectedWallet().then((addr) => {
      if (addr) setWalletAddress(addr);
    });
    if (window.ethereum?.on) {
      window.ethereum.on("accountsChanged", (...args: unknown[]) => {
        const accounts = args[0] as string[];
        setWalletAddress(accounts && accounts.length > 0 ? accounts[0] : null);
      });
    }
  }, []);
  const route = routeFor(hash);

  // Connect = read-only wallet link (eth_requestAccounts). The site only
  // READS the live contract after this — it never broadcasts a transaction.
  const connect = async () => {
    if (!window.ethereum) {
      setWalletNote("No injected wallet found in this browser. Install MetaMask (or open in a wallet browser) to connect.");
      return;
    }
    try {
      const addr = await connectWallet();
      if (addr) {
        setWalletAddress(addr);
        setWalletNote(`Connected ${addr}. Loading your live player from the contract…`);
      } else {
        setWalletNote("No account selected.");
      }
    } catch {
      setWalletNote("Wallet connection was rejected.");
    }
  };

  return (
    <div>
      <header className="top">
        <div className="top-inner">
          <div className="brand">⚽ Agent <span>Football</span></div>
          <nav>
            {ROUTES.map((r) => (
              <a key={r.hash} href={r.hash} className={route.hash === r.hash ? "active" : ""}>
                {r.label}
              </a>
            ))}
          </nav>
          <button className="connect-btn ghost" onClick={connect}>
            {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet (Agent ID)"}
          </button>
        </div>
      </header>
      <main className="page">
        {walletNote && (
          <div className="card warn">
            <div className="meta">{walletNote}</div>
          </div>
        )}
        {route.page}
        <footer>
          <div className="meta">
            Agent Football — Season 1 starts Tue Dec 1, 2026 · Pre-season Nov 27-30, 2026 ·
            Finals Jan 23, 2027 · BSC (chain {CHAIN_ID}) · Agent ID registry{" "}
            <span style={{ overflowWrap: "anywhere" }}>{AGENT_ID_REGISTRY}</span>
          </div>
          {DEPLOYED && (
            <div className="meta">
              Contract LIVE on BSC:{" "}
              <a href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
                <span style={{ overflowWrap: "anywhere" }}>{CONTRACT_ADDRESS}</span>
              </a>{" "}
              · Sourcify verified
            </div>
          )}
          <div className="meta">
            League, Clubs and Live Match Center are public view. Every action — mint, train,
            buy/use item, duel, play, join a team — requires an Agent ID. $KICK is off-chain
            points in Season 1: no price, no trading, no liquidity.
          </div>
        </footer>
      </main>
    </div>
  );
}
