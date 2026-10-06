import {
  useEffect,
  useState,
  useRef,
  createContext,
  useContext,
  type FormEvent,
} from "react";
import {
  NavLink,
  Routes,
  Route,
  useLocation,
  useNavigate,
  useSearchParams,
  Link,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  LayoutDashboard,
  GitBranch,
  Bot,
  Coins,
  FlaskConical,
  Bell,
  Settings2,
  Search,
  ChevronsUpDown,
  ArrowUpRight,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Menu as MenuIcon,
  Command,
  BookOpen,
  Radio,
  ChevronRight,
  LogOut,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, useData } from "./api";
import { Button, Modal, Loading, Menu, MenuItem } from "./components/ui";
import {
  Overview,
  Traces,
  TraceDetail,
  Agents,
  Costs,
  Evaluations,
  Alerts,
  Settings,
} from "./pages";

type Context = {
  project: string;
  role: string;
  params: URLSearchParams;
  base: string;
  setFilter: (key: string, value: string) => void;
  source: string;
};
const Workspace = createContext<Context>(null!);
export const useWorkspace = () => useContext(Workspace);
const navigation = [
  ["Overview", "/", LayoutDashboard],
  ["Traces", "/traces", GitBranch],
  ["Agents", "/agents", Bot],
  ["Costs", "/costs", Coins],
  ["Evaluations", "/evaluations", FlaskConical],
  ["Alerts", "/alerts", Bell],
] as const;

function Login({ done }: { done: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(f)),
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-brand">
        <span className="logo">
          <Activity />
        </span>
        TracePilot<span className="brand-tag">OBSERVABILITY</span>
      </div>
      <form className="login-form" onSubmit={submit}>
        <span className="eyebrow">YOUR AGENTS. IN FOCUS.</span>
        <h1>Welcome to TracePilot</h1>
        <p>Sign in to your observability workspace.</p>
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="you@company.com"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
          />
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <Button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in to workspace"}
        </Button>
        <p className="muted small">
          Use the administrator account configured during setup.
        </p>
      </form>
      <span className="login-footer">Understand every execution.</span>
    </div>
  );
}

export default function App() {
  const me = useData("/me");
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(
    localStorage.getItem("tracepilot-theme") === "dark",
  );
  const [search, setSearch] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [live, setLive] = useState(false);
  const project =
    params.get("project") || me.data?.projects?.[0]?.id || "research";
  const role =
    me.data?.projects?.find((p: any) => p.id === project)?.role || "Viewer";
  const source = params.get("source") || "sample";
  const query = new URLSearchParams(params);
  if (!query.has("source")) query.set("source", source);
  if (!query.has("hours")) query.set("hours", "24");
  const base = "/projects/" + project;
  const noticeSettings = useData(me.data ? base + "/settings" : "/health");
  const notices = useData(me.data ? base + "/alerts?" + query : "/health");
  const seenNotices = useRef(new Set<string>());
  useEffect(() => {
    if (!noticeSettings.data?.notifications) return;
    for (const a of notices.data?.alert || []) {
      if (a.status === "open" && !seenNotices.current.has(a.id)) {
        seenNotices.current.add(a.id);
        toast.warning(a.name, {
          description: "Alert threshold exceeded. Review Alerts for details.",
        });
      }
    }
  }, [notices.data, noticeSettings.data]);
  const results = useData(
    search && searchText
      ? `${base}/search?${query}&q=${encodeURIComponent(searchText)}`
      : "/health",
  );
  function setFilter(key: string, value: string) {
    setParams((p) => {
      const next = new URLSearchParams(p);
      value ? next.set(key, value) : next.delete(key);
      next.delete("page");
      return next;
    });
  }
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("tracepilot-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => {
    if (!me.data) return;
    const stream = new EventSource(`/api${base}/stream`);
    stream.onopen = () => setLive(true);
    stream.onerror = () => setLive(false);
    stream.addEventListener("refresh", () => {
      client.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith(base),
      });
    });
    stream.addEventListener("expired", () => {
      stream.close();
      setLive(false);
      client.invalidateQueries({ queryKey: ["/me"] });
    });
    return () => stream.close();
  }, [base, !!me.data, client]);
  useEffect(() => setMobile(false), [location.pathname]);
  if (me.isLoading) return <Loading />;
  if (!me.data)
    return (
      <Login done={() => client.invalidateQueries({ queryKey: ["/me"] })} />
    );
  const page = location.pathname.startsWith("/traces/")
    ? "Trace detail"
    : navigation.find((n) => n[1] === location.pathname)?.[0] || "Settings";
  const shared = new URLSearchParams();
  ["project", "environment", "source", "hours"].forEach((k) => {
    if (query.get(k)) shared.set(k, query.get(k)!);
  });
  return (
    <Workspace.Provider
      value={{ project, role, params: query, base, setFilter, source }}
    >
      <div
        className={
          "app " + (collapsed ? "collapsed " : "") + (mobile ? "nav-open" : "")
        }
      >
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {mobile && (
          <button
            className="nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className="sidebar">
          <Link className="brand" to={"/?" + shared}>
            <span className="logo">
              <Activity size={21} />
            </span>
            <span>
              TracePilot<span className="brand-beta">BETA</span>
            </span>
          </Link>
          <div className="workspace-picker">
            <span className="workspace-avatar">R</span>
            <div>
              <strong>
                {me.data.projects.find((p: any) => p.id === project)?.name ||
                  "Workspace"}
              </strong>
              <span>Engineering workspace</span>
            </div>
            <ChevronsUpDown size={14} />
          </div>
          <p className="nav-label">WORKSPACE</p>
          <nav>
            {navigation.map(([title, url, Icon]) => (
              <NavLink
                end={url === "/"}
                key={url}
                to={url + "?" + shared}
                title={collapsed ? title : undefined}
              >
                <Icon size={18} />
                <span>{title}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sdk-note">
              <div>
                <span className="mini-logo">
                  <GitBranch size={16} />
                </span>
                <strong>One trace. The full picture.</strong>
              </div>
              <p>
                Connect your agents and see what happens between input and
                output.
              </p>
              <a href="/api/docs" target="_blank" rel="noreferrer">
                Explore the API <ArrowUpRight size={14} />
              </a>
            </div>
            <a
              className="nav-bottom"
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen size={17} />
              <span>Documentation</span>
              <ArrowUpRight size={13} />
            </a>
            <NavLink className="nav-bottom" to={"/settings?" + shared}>
              <Settings2 size={17} />
              <span>Settings</span>
            </NavLink>
            <div className="sidebar-account">
              <div className="avatar">
                {me.data.email.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <strong>{me.data.email.split("@")[0]}</strong>
                <span>{role} · Research workspace</span>
              </div>
              <button
                aria-label="Collapse sidebar"
                className="icon-button"
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? (
                  <PanelLeft size={16} />
                ) : (
                  <PanelLeftClose size={16} />
                )}
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <MenuIcon size={21} />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{page}</strong>
            </div>
            <div className="topbar-actions">
              <button
                className="search-trigger"
                onClick={() => setSearch(true)}
              >
                <Search size={15} />
                <span>Search anything…</span>
                <kbd>⌘ K</kbd>
              </button>
              <span className={"connection " + (live ? "connected" : "")}>
                <span />
                {live ? "Connected" : "Reconnecting…"}
              </span>
              <button
                className="icon-button"
                aria-label="Toggle theme"
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <Menu
                label={
                  <span className="avatar tiny">
                    {me.data.email.slice(0, 2).toUpperCase()}
                  </span>
                }
              >
                <MenuItem onSelect={() => navigate("/settings?" + shared)}>
                  Account settings
                </MenuItem>
                <MenuItem
                  onSelect={async () => {
                    await api("/logout", { method: "POST" });
                    client.clear();
                    location;
                    window.location.reload();
                  }}
                >
                  Sign out
                </MenuItem>
              </Menu>
            </div>
          </header>
          <main id="main">
            <div className="page-heading">
              <div>
                <div className="eyebrow">AGENT OBSERVABILITY</div>
                <h1>{page}</h1>
                <p>
                  {
                    (
                      {
                        Overview:
                          "A clear view of your agents, from first token to final answer.",
                        Traces:
                          "Follow every execution. Find the moments that matter.",
                        Agents:
                          "Monitor performance across agents and versions.",
                        Costs: "Understand where your tokens and budget go.",
                        Evaluations:
                          "Measure quality with transparent, deterministic checks.",
                        Alerts:
                          "Catch regressions before they become incidents.",
                        Settings:
                          "Manage your workspace, access, and telemetry.",
                        "Trace detail":
                          "The complete execution, one span at a time.",
                      } as any
                    )[page]
                  }
                </p>
              </div>
              <div className="heading-controls">
                <select
                  aria-label="Project"
                  value={project}
                  onChange={(e) => setFilter("project", e.target.value)}
                >
                  {me.data.projects.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Environment"
                  value={params.get("environment") || "all"}
                  onChange={(e) => setFilter("environment", e.target.value)}
                >
                  <option value="all">All environments</option>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                </select>
              </div>
            </div>
            <div className="view-toolbar">
              <div className="source-switch" aria-label="Data source">
                <button
                  className={source === "sample" ? "active" : ""}
                  onClick={() => setFilter("source", "sample")}
                >
                  Sample workspace
                </button>
                <button
                  className={source === "telemetry" ? "active" : ""}
                  onClick={() => setFilter("source", "telemetry")}
                >
                  <Radio size={13} />
                  Your telemetry
                </button>
              </div>
              <div className="range-controls">
                <span className="muted small">All times local</span>
                <select
                  aria-label="Time range"
                  value={params.get("hours") || "24"}
                  onChange={(e) => setFilter("hours", e.target.value)}
                >
                  <option value="1">Last hour</option>
                  <option value="24">Last 24 hours</option>
                  <option value="168">Last 7 days</option>
                  <option value="720">Last 30 days</option>
                </select>
              </div>
            </div>
            {source === "sample" && (
              <div className="sample-notice">
                <FlaskConical size={14} />
                <span>
                  Sample data{" "}
                  <span className="muted">
                    · Deterministic fixtures with simulated model activity.
                    Separate from your telemetry.
                  </span>
                </span>
                <button onClick={() => setFilter("source", "telemetry")}>
                  View your telemetry <ChevronRight size={13} />
                </button>
              </div>
            )}
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/traces" element={<Traces />} />
              <Route path="/traces/:traceId" element={<TraceDetail />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/costs" element={<Costs />} />
              <Route path="/evaluations" element={<Evaluations />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/settings" element={<Settings />} />
              <Route
                path="*"
                element={
                  <div className="empty">
                    Page not found. <Link to="/">Return to overview</Link>
                  </div>
                }
              />
            </Routes>
            <footer className="page-footer">
              <span>
                <Activity size={13} /> TracePilot{" "}
                <span className="muted">/</span> Understand every execution.
              </span>
              <span>Project-scoped telemetry · v0.1</span>
            </footer>
          </main>
        </div>
        <Modal
          open={search}
          onOpenChange={setSearch}
          title="Search workspace"
          description="Find traces and agents in the selected data source and time range."
        >
          <div className="search-box">
            <Search size={18} />
            <input
              aria-label="Search traces and agents"
              autoFocus
              placeholder="Agent name, trace ID, or tag…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          {searchText && (
            <div className="search-results">
              {results.data?.agents?.map((a: string) => (
                <button
                  key={a}
                  onClick={() => {
                    navigate(
                      "/agents?" + shared + "&q=" + encodeURIComponent(a),
                    );
                    setSearch(false);
                  }}
                >
                  <Bot size={17} />
                  {a}
                  <span>Agent</span>
                </button>
              ))}
              {results.data?.traces?.map((r: any) => (
                <button
                  key={r.trace_id}
                  onClick={() => {
                    navigate("/traces/" + r.trace_id + "?" + shared);
                    setSearch(false);
                  }}
                >
                  <GitBranch size={17} />
                  <div>
                    {r.name}
                    <small>{r.trace_id}</small>
                  </div>
                </button>
              ))}
              {results.data?.traces?.length === 0 && (
                <p>No matching traces or agents.</p>
              )}
            </div>
          )}
        </Modal>
      </div>
    </Workspace.Provider>
  );
}
