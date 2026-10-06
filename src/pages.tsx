import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Coins,
  Copy,
  Download,
  GitBranch,
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Plus,
  Play,
  ShieldCheck,
  KeyRound,
  Trash2,
  AlertTriangle,
  Bot,
  Cpu,
  Wrench,
  Database,
  X,
  CircleHelp,
} from "lucide-react";
import { toast } from "sonner";
import { api, useData, number, money, duration, date } from "./api";
import { useWorkspace } from "./App";
import {
  Button,
  Badge,
  Modal,
  Menu,
  MenuItem,
  Empty,
  ErrorState,
  Loading,
} from "./components/ui";

function useView(endpoint: string) {
  const { base, params } = useWorkspace();
  return useData(
    `${base}/${endpoint}${endpoint.includes("?") ? "&" : "?"}${params}`,
  );
}
function QueryState({ q, children }: { q: any; children: React.ReactNode }) {
  return q.isLoading ? (
    <Loading />
  ) : q.error ? (
    <ErrorState error={q.error} retry={() => q.refetch()} />
  ) : (
    <>{children}</>
  );
}
function SectionTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
function TraceLink({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { params } = useWorkspace();
  return (
    <Link className="trace-link" to={`/traces/${id}?${params}`}>
      {children}
    </Link>
  );
}
const colors = ["#269b75", "#64b69b", "#9dceba", "#d3e9df"];

export function Overview() {
  const q = useView("overview");
  const alerts = useView("alerts");
  const { params } = useWorkspace();
  const navigate = useNavigate();
  const d = q.data;
  const m = d?.metrics;
  const go = (extra: string) => navigate("/traces?" + params + "&" + extra);
  const stats = m
    ? [
        {
          label: "Total executions",
          value: number(m.runs),
          icon: GitBranch,
          key: "runs",
        },
        {
          label: "Success rate",
          value: m.success_rate == null ? "—" : m.success_rate.toFixed(1) + "%",
          icon: CheckCircle2,
          key: "success_rate",
        },
        {
          label: "Latency · p50 / p95",
          value: m.p50 == null ? "—" : duration(m.p50),
          suffix: "/ " + (m.p95 == null ? "—" : duration(m.p95)),
          icon: Clock3,
          key: "p50",
        },
        {
          label: "Tokens used",
          value: number(m.tokens),
          icon: Cpu,
          key: "tokens",
        },
        {
          label: "Estimated cost",
          value: money(m.cost),
          icon: Coins,
          key: "cost",
        },
        {
          label: "Evaluation pass rate",
          value:
            d.evaluation_rate == null
              ? "—"
              : d.evaluation_rate.toFixed(1) + "%",
          icon: ShieldCheck,
          key: "evaluation",
        },
      ]
    : [];
  return (
    <QueryState q={q}>
      {d && (
        <>
          <div className="metric-grid">
            {stats.map((s) => {
              const previous = d.previous[s.key];
              const delta = previous
                ? ((m[s.key] - previous) / previous) * 100
                : null;
              return (
                <div className="metric" key={s.label}>
                  <div className="metric-label">
                    {s.label}
                    <s.icon size={15} />
                  </div>
                  <div className="metric-value">
                    {s.value}
                    {s.suffix && <small>{s.suffix}</small>}
                  </div>
                  <div className="metric-trend">
                    {delta != null ? (
                      <>
                        <span className={s.key === "p50" ? "muted" : "green"}>
                          {delta >= 0 ? (
                            <ArrowUpRight size={13} />
                          ) : (
                            <ArrowDownRight size={13} />
                          )}{" "}
                          {Math.abs(delta).toFixed(1)}%
                        </span>
                        <span>vs. previous period</span>
                      </>
                    ) : (
                      <span>
                        {s.key === "evaluation"
                          ? "Run checks in Evaluations"
                          : "No prior-period comparison"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <section className="chart-panel volume-panel">
            <SectionTitle
              title="Execution volume"
              subtitle="Agent runs over the selected time window"
            >
              <div className="chart-legend">
                <span>
                  <i />
                  Successful & other runs
                </span>
                <span>
                  <i className="error-dot" />
                  Errors
                </span>
                <Button onClick={() => go("")}>
                  View traces <ArrowUpRight size={13} />
                </Button>
              </div>
            </SectionTitle>
            {d.series.length ? (
              <div className="main-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={d.series}
                    margin={{ left: -24, right: 8, top: 10, bottom: 0 }}
                    onClick={(e: any) => {
                      if (e?.activePayload?.[0])
                        go(
                          "since=" +
                            encodeURIComponent(
                              e.activePayload[0].payload.time,
                            ) +
                            "&until=" +
                            encodeURIComponent(
                              new Date(
                                Date.parse(e.activePayload[0].payload.time) +
                                  (Number(params.get("hours") || 24) <= 48
                                    ? 3600000
                                    : 86400000),
                              ).toISOString(),
                            ),
                        );
                    }}
                  >
                    <defs>
                      <linearGradient id="volume" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#269b75"
                          stopOpacity={0.18}
                        />
                        <stop
                          offset="100%"
                          stopColor="#269b75"
                          stopOpacity={0.015}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 4"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="time"
                      tickFormatter={(t) =>
                        new Date(t).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      }
                      axisLine={false}
                      tickLine={false}
                      minTickGap={55}
                      tick={{ fontSize: 12, fill: "var(--muted)" }}
                      dy={10}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "var(--muted)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                      }}
                      labelFormatter={(v) => date(String(v))}
                    />
                    <Area
                      name="Executions"
                      type="monotone"
                      dataKey="runs"
                      stroke="#269b75"
                      strokeWidth={2}
                      fill="url(#volume)"
                      isAnimationActive={false}
                    />
                    <Area
                      name="Errors"
                      type="monotone"
                      dataKey="errors"
                      stroke="#d39167"
                      strokeWidth={1.5}
                      fill="transparent"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty
                title="Your first trace starts here"
                text="Create an ingestion key in Settings, then run the example agent."
              />
            )}
            <div className="chart-caption">
              <span>
                <Activity size={13} /> {number(m.runs)} executions in this
                window
              </span>
              <span>Click the chart to explore traces</span>
            </div>
          </section>
          <div className="two-columns">
            <section className="chart-panel">
              <SectionTitle
                title="Latency distribution"
                subtitle="End-to-end execution time"
              >
                <span className="pill">milliseconds</span>
              </SectionTitle>
              <div className="small-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={d.distribution}
                    margin={{ left: -25, right: 8, top: 10 }}
                    onClick={(e: any) => {
                      const index = d.distribution.findIndex(
                        (x: any) => x.name === e?.activeLabel,
                      );
                      if (index >= 0)
                        go(
                          "min_duration=" +
                            [0, 1000, 2000, 5000, 10000][index] +
                            (index < 4
                              ? "&max_duration=" +
                                [1000, 2000, 5000, 10000][index]
                              : ""),
                        );
                    }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 4"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "var(--muted)" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "var(--muted)" }}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--hover)" }}
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Executions"
                      fill="#83bba8"
                      maxBarSize={65}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-caption">
                <span>
                  Median <strong>{duration(m.p50)}</strong>
                </span>
                <span>
                  95th percentile <strong>{duration(m.p95)}</strong>
                </span>
              </div>
            </section>
            <section className="chart-panel">
              <SectionTitle
                title="Cost by model"
                subtitle="Estimated from versioned pricing assumptions"
              >
                <Link className="text-link" to={"/costs?" + params}>
                  Cost breakdown <ArrowUpRight size={13} />
                </Link>
              </SectionTitle>
              <div className="cost-summary">
                <strong>{money(m.cost)}</strong>
                <span>estimated spend</span>
              </div>
              <div className="model-bars">
                {d.costs.map((c: any, i: number) => (
                  <button
                    key={c.name}
                    onClick={() => go("model=" + encodeURIComponent(c.name))}
                  >
                    <div>
                      <span>
                        <i style={{ background: colors[i % 4] }} />
                        {c.name}
                      </span>
                      <strong>{money(c.cost)}</strong>
                    </div>
                    <div className="bar-track">
                      <span
                        style={{
                          width:
                            (c.cost && m.cost ? (c.cost / m.cost) * 100 : 0) +
                            "%",
                          background: colors[i % 4],
                        }}
                      />
                    </div>
                    <small>
                      {number(c.tokens)} tokens · {c.calls} calls
                    </small>
                  </button>
                ))}
                {!d.costs.length && <Empty />}
              </div>
              <div className="chart-caption">
                <span>
                  <CircleHelp size={13} /> Usage from LLM spans only
                </span>
                <span>{m.unknown_cost_runs} runs with unavailable pricing</span>
              </div>
            </section>
          </div>
          <section className="recent-section">
            <SectionTitle
              title="Recent executions"
              subtitle="The latest activity across your agents"
            >
              <Link className="text-link" to={"/traces?" + params}>
                All traces <ArrowRight size={14} />
              </Link>
            </SectionTitle>
            <TraceTable rows={d.recent} />
          </section>
          <div className="two-columns bottom-columns">
            <section>
              <SectionTitle title="Recent failures">
                <span className="count-badge">{d.failures.length}</span>
              </SectionTitle>
              {d.failures.slice(0, 3).map((r: any) => (
                <TraceLink key={r.trace_id} id={r.trace_id}>
                  <div className="failure-row">
                    <span className="failure-icon">
                      <AlertTriangle size={15} />
                    </span>
                    <div>
                      <strong>{r.agent}</strong>
                      <p>{r.attributes.error || "Execution failed"}</p>
                    </div>
                    <span>{date(r.start_time)}</span>
                    <ChevronRight size={14} />
                  </div>
                </TraceLink>
              ))}
              {!d.failures.length && (
                <Empty
                  title="No failures in this window"
                  text="Completed executions have no reported errors."
                />
              )}
            </section>
            <section>
              <SectionTitle title="Active alerts">
                <Link className="text-link" to={"/alerts?" + params}>
                  Manage alerts <ArrowUpRight size={13} />
                </Link>
              </SectionTitle>
              {alerts.data?.alert
                ?.filter((a: any) => a.status !== "resolved")
                .slice(0, 3)
                .map((a: any) => (
                  <Link
                    to={"/alerts?" + params}
                    className="alert-overview"
                    key={a.id}
                  >
                    <span className="amber-icon">
                      <AlertTriangle size={18} />
                    </span>
                    <div>
                      <strong>{a.name}</strong>
                      <p>
                        {a.metric.replaceAll("_", " ")} exceeded {a.threshold} ·{" "}
                        {a.status}
                      </p>
                    </div>
                    <ChevronRight size={15} />
                  </Link>
                ))}
              {!alerts.data?.alert?.some(
                (a: any) => a.status !== "resolved",
              ) && (
                <Empty
                  title="All quiet here"
                  text="No active alerts for the selected data source."
                />
              )}
            </section>
          </div>
        </>
      )}
    </QueryState>
  );
}

function TraceTable({
  rows,
  visibility = {},
}: {
  rows: any[];
  visibility?: Record<string, boolean>;
}) {
  const { setFilter, params } = useWorkspace();
  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Execution",
        cell: ({ row }) => (
          <TraceLink id={row.original.trace_id}>
            <span className="execution-name">
              <GitBranch size={14} />
              {row.original.name}
            </span>
            <span className="trace-id">
              {row.original.trace_id.slice(0, 23)}
            </span>
          </TraceLink>
        ),
      },
      {
        accessorKey: "agent",
        header: "Agent",
        cell: ({ getValue }) => (
          <span className="agent-tag">
            <Bot size={13} />
            {String(getValue())}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => <Badge status={String(getValue())} />,
      },
      {
        accessorKey: "duration_ms",
        header: "Latency",
        cell: ({ getValue }) => (
          <span className="mono">{duration(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "tokens",
        header: "Tokens",
        cell: ({ getValue }) => (
          <span className="mono">{number(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "cost",
        header: "Est. cost",
        cell: ({ getValue }) => (
          <span className="mono">{money(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "start_time",
        header: "Started",
        cell: ({ getValue }) => (
          <span className="muted nowrap">{date(String(getValue()))}</span>
        ),
      },
    ],
    [],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility: visibility },
  });
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          {table.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {g.headers.map((h) => (
                <th key={h.id}>
                  {h.id === "name" ? (
                    flexRender(h.column.columnDef.header, h.getContext())
                  ) : (
                    <button
                      onClick={() => {
                        setFilter("sort", h.id);
                        setFilter(
                          "order",
                          params.get("order") === "asc" ? "desc" : "asc",
                        );
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <ChevronsUpDown size={11} />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.original.trace_id}>
              {row.getVisibleCells().map((c) => (
                <td key={c.id}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}

export function Traces() {
  const q = useView("traces");
  const { params, setFilter, base } = useWorkspace();
  const [filters, setFilters] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const page = Number(params.get("page") || 1);
  const navigate = useNavigate();
  function paginate(p: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    navigate("/traces?" + next);
  }
  return (
    <>
      <div className="table-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            aria-label="Search traces"
            placeholder="Search traces, agents, or IDs…"
            value={params.get("q") || ""}
            onChange={(e) => setFilter("q", e.target.value)}
          />
        </div>
        <select
          aria-label="Status"
          value={params.get("status") || ""}
          onChange={(e) => setFilter("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {["success", "error", "running", "cancelled"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Button onClick={() => setFilters(!filters)}>
          <SlidersHorizontal size={14} />
          Filters
        </Button>
        <div className="toolbar-spacer" />
        <Menu label="Columns">
          {[
            "agent",
            "status",
            "duration_ms",
            "tokens",
            "cost",
            "start_time",
          ].map((k) => (
            <MenuItem
              key={k}
              onSelect={() =>
                setVisibility((v) => ({ ...v, [k]: v[k] === false }))
              }
            >
              {visibility[k] !== false ? "✓ " : ""}
              {k.replace("_", " ")}
            </MenuItem>
          ))}
        </Menu>
        <a className="button" href={"/api" + base + "/export?" + params}>
          <Download size={14} />
          Export CSV
        </a>
      </div>
      {filters && (
        <div className="filter-panel">
          {[
            ["agent", "Agent"],
            ["model", "Model"],
            ["tag", "Tag"],
            ["min_duration", "Minimum latency (ms)"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={params.get(key) || ""}
                type={key === "min_duration" ? "number" : "text"}
                min="0"
                onChange={(e) => setFilter(key, e.target.value)}
              />
            </label>
          ))}
          <Button
            onClick={() =>
              [
                "agent",
                "model",
                "tag",
                "min_duration",
                "max_duration",
                "q",
                "status",
                "since",
                "until",
              ].forEach((k) => setFilter(k, ""))
            }
          >
            Clear filters
          </Button>
        </div>
      )}
      <QueryState q={q}>
        {q.data && (
          <>
            <TraceTable rows={q.data.items} visibility={visibility} />
            <div className="pagination">
              <span>
                {q.data.total
                  ? `${(page - 1) * 15 + 1}–${Math.min(page * 15, q.data.total)} of ${q.data.total} executions`
                  : "0 executions"}
              </span>
              <div>
                <Button
                  disabled={page === 1}
                  onClick={() => paginate(page - 1)}
                >
                  <ChevronLeft size={14} />
                  Previous
                </Button>
                <span>Page {page}</span>
                <Button
                  disabled={page * 15 >= q.data.total}
                  onClick={() => paginate(page + 1)}
                >
                  Next
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}

export function TraceDetail() {
  const { traceId } = useParams();
  const { base, params, setFilter } = useWorkspace();
  const q = useData(`${base}/traces/${traceId}`);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const spans = q.data?.spans || [];
  const chosen =
    spans.find((s: any) => s.span_id === params.get("span")) || spans[0];
  const start = spans.length
    ? Math.min(...spans.map((s: any) => Date.parse(s.start_time)))
    : 0;
  const end = spans.length
    ? Math.max(
        ...spans.map((s: any) =>
          Date.parse(s.end_time || new Date().toISOString()),
        ),
      )
    : 0;
  const total = Math.max(end - start, 1);
  function depth(s: any, seen: string[] = []): number {
    if (!s.parent_span_id || seen.includes(s.span_id)) return 0;
    const parent = spans.find((p: any) => p.span_id === s.parent_span_id);
    return parent ? Math.min(8, 1 + depth(parent, [...seen, s.span_id])) : 0;
  }
  function hidden(s: any, seen: string[] = []): boolean {
    if (!s.parent_span_id || seen.includes(s.span_id)) return false;
    return (
      collapsed.includes(s.parent_span_id) ||
      !!spans.find(
        (p: any) =>
          p.span_id === s.parent_span_id && hidden(p, [...seen, s.span_id]),
      )
    );
  }
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };
  return (
    <QueryState q={q}>
      {chosen && (
        <>
          <div className="trace-summary">
            <div>
              <Badge status={spans[0]?.status} />
              <code>{traceId}</code>
              <button
                className="icon-button"
                aria-label="Copy trace ID"
                onClick={() => copy(traceId!)}
              >
                <Copy size={14} />
              </button>
            </div>
            <Button onClick={() => copy(window.location.href)}>
              <Copy size={14} />
              Copy deep link
            </Button>
          </div>
          <div className="trace-meta">
            <span>
              Agent <strong>{chosen.agent}</strong>
            </span>
            <span>
              Version <code>{chosen.agent_version}</code>
            </span>
            <span>
              Environment <strong>{chosen.environment}</strong>
            </span>
            <span>
              Spans <strong>{spans.length}</strong>
            </span>
            <span>
              Duration <strong>{duration(total)}</strong>
            </span>
          </div>
          <section className="waterfall">
            <SectionTitle
              title="Execution waterfall"
              subtitle="Select a span to inspect its attributes and timing"
            >
              <span className="pill">{spans.length} spans</span>
            </SectionTitle>
            <div className="waterfall-scroll">
              <div className="waterfall-axis">
                <span>Span</span>
                <div>
                  {[0, 0.25, 0.5, 0.75, 1].map((n) => (
                    <span key={n}>{duration(total * n)}</span>
                  ))}
                </div>
              </div>
              {spans
                .filter((s: any) => !hidden(s))
                .map((s: any) => {
                  const Icon = (
                    {
                      agent: Bot,
                      llm: Cpu,
                      tool: Wrench,
                      retrieval: Database,
                    } as any
                  )[s.span_type];
                  return (
                    <div
                      key={s.span_id}
                      className={
                        "span-row " +
                        (chosen.span_id === s.span_id ? "selected" : "")
                      }
                    >
                      <div style={{ paddingLeft: 12 + depth(s) * 20 }}>
                        {spans.some(
                          (c: any) => c.parent_span_id === s.span_id,
                        ) ? (
                          <button
                            className="icon-button"
                            aria-label={"Toggle " + s.name}
                            onClick={() =>
                              setCollapsed((v) =>
                                v.includes(s.span_id)
                                  ? v.filter((id) => id !== s.span_id)
                                  : [...v, s.span_id],
                              )
                            }
                          >
                            <ChevronRight
                              size={13}
                              style={{
                                transform: collapsed.includes(s.span_id)
                                  ? ""
                                  : "rotate(90deg)",
                              }}
                            />
                          </button>
                        ) : (
                          <span className="tree-spacer" />
                        )}
                        <button
                          className="span-label"
                          onClick={() => setFilter("span", s.span_id)}
                        >
                          <Icon size={15} />
                          {s.name}
                        </button>
                      </div>
                      <button
                        aria-label={"Inspect " + s.name}
                        className="timeline"
                        onClick={() => setFilter("span", s.span_id)}
                      >
                        <span
                          className={"span-bar " + s.span_type + " " + s.status}
                          style={{
                            left:
                              ((Date.parse(s.start_time) - start) / total) *
                                100 +
                              "%",
                            width:
                              Math.max(
                                0.7,
                                ((Date.parse(
                                  s.end_time || new Date().toISOString(),
                                ) -
                                  Date.parse(s.start_time)) /
                                  total) *
                                  100,
                              ) + "%",
                          }}
                        >
                          {duration(s.duration_ms)}
                        </span>
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>
          <section className="span-detail">
            <SectionTitle
              title={chosen.name}
              subtitle={chosen.span_type + " span"}
            >
              <Badge status={chosen.status} />
            </SectionTitle>
            <div className="detail-grid">
              <div>
                <label>Span ID</label>
                <button
                  className="copy-value"
                  onClick={() => copy(chosen.span_id)}
                >
                  <code>{chosen.span_id}</code>
                  <Copy size={12} />
                </button>
              </div>
              <div>
                <label>Started at (UTC)</label>
                <code>{chosen.start_time}</code>
              </div>
              <div>
                <label>Latency</label>
                <strong>{duration(chosen.duration_ms)}</strong>
              </div>
              <div>
                <label>Model</label>
                <strong>{chosen.model || "Not applicable"}</strong>
              </div>
              <div>
                <label>Input / output tokens</label>
                <code>
                  {number(chosen.input_tokens)} / {number(chosen.output_tokens)}
                </code>
              </div>
              <div>
                <label>Estimated cost</label>
                <strong>
                  {chosen.span_type === "llm"
                    ? money(chosen.estimated_cost)
                    : "Not applicable"}
                </strong>
              </div>
              <div>
                <label>Ended at (UTC)</label>
                <code>{chosen.end_time || "In progress"}</code>
              </div>
              <div>
                <label>Revision</label>
                <code>{chosen.revision}</code>
              </div>
            </div>
            {chosen.attributes.error && (
              <div className="exception">
                <AlertTriangle size={18} />
                <div>
                  <strong>Execution exception</strong>
                  <pre>{chosen.attributes.error}</pre>
                </div>
              </div>
            )}
            <details open>
              <summary>Redacted attributes</summary>
              <pre className="json">
                {JSON.stringify(chosen.attributes, null, 2)}
              </pre>
            </details>
            <p className="muted small">
              <ShieldCheck size={13} /> Prompts, outputs, credentials, and
              sensitive fields are redacted before persistence.
            </p>
          </section>
        </>
      )}
    </QueryState>
  );
}

export function Agents() {
  const q = useView("agents");
  const { params } = useWorkspace();
  return (
    <QueryState q={q}>
      <div className="section-title">
        <h2>
          Registered activity{" "}
          <span className="count-badge">{q.data?.length || 0}</span>
        </h2>
        <span className="muted small">
          Versions compared over the same time window
        </span>
      </div>
      {q.data?.length ? (
        <div className="agent-grid">
          {q.data.map((a: any) => (
            <section className="agent-card" key={a.name}>
              <div className="agent-card-header">
                <span className="agent-icon">
                  <Bot size={23} />
                </span>
                <div>
                  <h2>{a.name}</h2>
                  <span className="muted small">
                    {a.versions.length} active versions
                  </span>
                </div>
                <Link
                  aria-label={"View " + a.name + " traces"}
                  className="icon-button"
                  to={
                    "/traces?" + params + "&agent=" + encodeURIComponent(a.name)
                  }
                >
                  <ArrowUpRight size={18} />
                </Link>
              </div>
              <div className="agent-stats">
                <div>
                  <span>Executions</span>
                  <strong>{number(a.runs)}</strong>
                </div>
                <div>
                  <span>Success rate</span>
                  <strong>{a.success_rate?.toFixed(1) || "—"}%</strong>
                </div>
                <div>
                  <span>Est. cost</span>
                  <strong>{money(a.cost)}</strong>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Runs</th>
                    <th>p95</th>
                    <th>Error rate</th>
                  </tr>
                </thead>
                <tbody>
                  {a.versions.map((v: any) => (
                    <tr key={v.version}>
                      <td>
                        <Link
                          className="text-link mono"
                          to={
                            "/traces?" +
                            params +
                            "&agent=" +
                            a.name +
                            "&agent_version=" +
                            v.version
                          }
                        >
                          {v.version}
                        </Link>
                      </td>
                      <td>{v.runs}</td>
                      <td>{duration(v.p95)}</td>
                      <td>
                        {v.success_rate == null
                          ? "—"
                          : (100 - v.success_rate).toFixed(1) + "%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      ) : (
        <Empty
          title="No agent activity yet"
          text="Agents appear here when they emit their first span."
        />
      )}
    </QueryState>
  );
}

export function Costs() {
  const { params, setFilter } = useWorkspace();
  const q = useView("overview");
  const prices = useView("prices");
  return (
    <QueryState q={q}>
      {q.data && (
        <>
          <div className="cost-page-summary">
            <div>
              <span className="eyebrow">ESTIMATED SPEND</span>
              <h2>{money(q.data.metrics.cost)}</h2>
              <p>USD · {number(q.data.metrics.tokens)} reported tokens</p>
            </div>
            <div className="cost-explainer">
              <ShieldCheck size={22} />
              <div>
                <strong>Transparent by design</strong>
                <p>
                  Only LLM spans contribute to spend. Unknown pricing stays
                  unavailable; parent spans are never counted twice.
                </p>
              </div>
            </div>
          </div>
          <SectionTitle title="Spend breakdown">
            <select
              aria-label="Group costs by"
              value={params.get("group_by") || "model"}
              onChange={(e) => setFilter("group_by", e.target.value)}
            >
              {["model", "agent", "provider", "day"].map((k) => (
                <option key={k} value={k}>
                  By {k}
                </option>
              ))}
            </select>
          </SectionTitle>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{params.get("group_by") || "Model"}</th>
                  <th>LLM calls</th>
                  <th>Reported tokens</th>
                  <th>Estimated cost</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {q.data.costs.map((c: any, i: number) => (
                  <tr key={c.name}>
                    <td>
                      <i
                        className="color-marker"
                        style={{ background: colors[i % 4] }}
                      />
                      {c.name}
                    </td>
                    <td>{number(c.calls)}</td>
                    <td className="mono">{number(c.tokens)}</td>
                    <td className="mono">{money(c.cost)}</td>
                    <td>
                      <div className="bar-track">
                        <span
                          style={{
                            width:
                              (c.cost && q.data.metrics.cost
                                ? (c.cost / q.data.metrics.cost) * 100
                                : 0) + "%",
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!q.data.costs.length && <Empty />}
          </div>
          <section className="pricing-section">
            <SectionTitle
              title="Pricing assumptions"
              subtitle="Versioned rates per one million tokens. These are not live provider quotes."
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Version</th>
                    <th>Input / 1M</th>
                    <th>Output / 1M</th>
                    <th>Effective from</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.data?.map((p: any) => (
                    <tr key={p.version}>
                      <td>
                        {p.model}
                        <small className="block muted">{p.note}</small>
                      </td>
                      <td className="mono">{p.version}</td>
                      <td>{money(p.input_per_million)}</td>
                      <td>{money(p.output_per_million)}</td>
                      <td>{p.effective_from.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </QueryState>
  );
}

export function Evaluations() {
  const q = useView("evaluations");
  const { base, params, role } = useWorkspace();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  async function run() {
    setBusy(true);
    try {
      const result = await api(`${base}/evaluations/run?${params}`, {
        method: "POST",
      });
      toast.success(`Evaluated ${result.cases} trace cases`);
      client.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <QueryState q={q}>
      <SectionTitle
        title="Quality datasets"
        subtitle="Deterministic checks · No LLM-as-judge scoring"
      >
        {role !== "Viewer" && (
          <Button className="primary" onClick={run} disabled={busy}>
            <Play size={14} />
            {busy ? "Running checks…" : "Run evaluation"}
          </Button>
        )}
      </SectionTitle>
      <div className="dataset-list">
        {q.data?.datasets.map((d: any) => (
          <div className="dataset" key={d.id}>
            <span className="agent-icon">
              <ShieldCheck size={23} />
            </span>
            <div>
              <h2>
                {d.name} <span className="pill">v{d.version}</span>
              </h2>
              <p>{d.description}</p>
            </div>
            <span className="pill">4 checks</span>
          </div>
        ))}
      </div>
      <SectionTitle
        title="Per-case results"
        subtitle="Checks use SDK-produced assertions and measured span latency."
      />
      {q.data?.runs.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Trace</th>
                <th>Agent version</th>
                <th>Passed</th>
                <th>Method</th>
                <th>Evaluated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.runs.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <TraceLink id={r.trace_id}>
                      {r.trace_id.slice(0, 24)}
                    </TraceLink>
                  </td>
                  <td>
                    {r.agent} <code>{r.agent_version}</code>
                  </td>
                  <td>
                    {r.checks.filter((c: any) => c.passed).length} /{" "}
                    {r.checks.filter((c: any) => c.passed !== null).length}{" "}
                    available
                  </td>
                  <td>Deterministic · v{r.version}</td>
                  <td>{date(r.created_at)}</td>
                  <td>
                    <Button onClick={() => setSelected(r)}>Inspect</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No evaluations in this window"
          text="Run the quality dataset against completed traces in the current filters."
        />
      )}
      <Modal
        open={!!selected}
        onOpenChange={() => setSelected(null)}
        title="Evaluation case"
        description={selected?.method}
      >
        {selected?.checks.map((c: any) => (
          <div className="check-row" key={c.name}>
            {c.passed == null ? (
              <CircleHelp size={18} className="muted" />
            ) : c.passed ? (
              <CheckCircle2 size={18} className="green" />
            ) : (
              <X size={18} className="error-text" />
            )}
            <strong>{c.name}</strong>
            <Badge
              status={
                c.passed == null
                  ? "unavailable"
                  : c.passed
                    ? "success"
                    : "error"
              }
            />
          </div>
        ))}
        <p className="muted small">
          Assertions are supplied by instrumentation. This is not an independent
          assessment of factual correctness.
        </p>
      </Modal>
    </QueryState>
  );
}

export function Alerts() {
  const q = useView("alerts");
  const { base, role, source } = useWorkspace();
  const client = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      await api(base + "/rules" + (editing.id ? "/" + editing.id : ""), {
        method: editing.id ? "PUT" : "POST",
        body: JSON.stringify({
          ...f,
          threshold: Number(f.threshold),
          min_samples: Number(f.min_samples),
          lookback_minutes: Number(f.lookback_minutes),
          enabled: f.enabled === "on",
          source,
        }),
      });
      toast.success("Alert rule saved");
      setEditing(null);
      client.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <QueryState q={q}>
      <SectionTitle
        title="Alert rules"
        subtitle="Checked every 30 seconds. Incidents resolve when the condition clears."
      >
        {role !== "Viewer" && (
          <Button className="primary" onClick={() => setEditing({})}>
            <Plus size={15} />
            Create rule
          </Button>
        )}
      </SectionTitle>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Metric</th>
              <th>Threshold</th>
              <th>Lookback</th>
              <th>Min. samples</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data?.rule.map((r: any) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <small className="block muted">{r.environment}</small>
                </td>
                <td>{r.metric.replaceAll("_", " ")}</td>
                <td>
                  {r.threshold}
                  {r.metric === "error_rate"
                    ? "%"
                    : r.metric === "p95_latency"
                      ? " ms"
                      : " USD"}
                </td>
                <td>{r.lookback_minutes} min</td>
                <td>{r.min_samples}</td>
                <td>
                  <Badge status={r.enabled ? "enabled" : "disabled"} />
                </td>
                <td>
                  {role !== "Viewer" && (
                    <Button onClick={() => setEditing(r)}>Edit rule</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.data?.rule.length && (
          <Empty
            title="No alert rules"
            text="Create a rule for error rate, p95 latency, or a spend limit."
          />
        )}
      </div>
      <section className="pricing-section">
        <SectionTitle
          title="Incident history"
          subtitle="Repeated breaches are deduplicated into one open incident."
        />
        {q.data?.alert.map((a: any) => (
          <div className="incident" key={a.id}>
            <AlertTriangle size={20} />
            <div>
              <strong>{a.name}</strong>
              <p>
                {a.metric.replaceAll("_", " ")}: {a.value.toFixed(2)} ·
                threshold {a.threshold} · {date(a.created_at)}
              </p>
            </div>
            <Badge status={a.status} />
            {a.status === "open" && role !== "Viewer" && (
              <Button
                onClick={async () => {
                  try {
                    await api(base + "/alerts/" + a.id + "/acknowledge", {
                      method: "POST",
                    });
                    client.invalidateQueries();
                    toast.success("Incident acknowledged");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Acknowledge
              </Button>
            )}
          </div>
        ))}
        {!q.data?.alert.length && (
          <Empty
            title="No incidents"
            text="New incidents appear here when a rule is breached."
          />
        )}
      </section>
      <Modal
        open={!!editing}
        onOpenChange={() => setEditing(null)}
        title={editing?.id ? "Edit alert rule" : "Create alert rule"}
        description={"This rule monitors " + source + " data."}
      >
        {editing && (
          <form className="form-stack" onSubmit={save}>
            <label>
              Rule name
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={editing.name}
                placeholder="Production latency regression"
              />
            </label>
            <div className="form-columns">
              <label>
                Metric
                <select
                  name="metric"
                  defaultValue={editing.metric || "error_rate"}
                >
                  <option value="error_rate">Error rate (%)</option>
                  <option value="p95_latency">p95 latency (ms)</option>
                  <option value="budget">Budget (USD)</option>
                </select>
              </label>
              <label>
                Threshold
                <input
                  name="threshold"
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  defaultValue={editing.threshold || 5}
                />
              </label>
              <label>
                Lookback (minutes)
                <input
                  name="lookback_minutes"
                  type="number"
                  min="1"
                  max="43200"
                  required
                  defaultValue={editing.lookback_minutes || 60}
                />
              </label>
              <label>
                Minimum samples
                <input
                  name="min_samples"
                  type="number"
                  min="1"
                  required
                  defaultValue={editing.min_samples || 5}
                />
              </label>
            </div>
            <label>
              Environment
              <select
                name="environment"
                defaultValue={editing.environment || "all"}
              >
                {["all", "production", "staging", "development"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={editing.enabled !== false}
              />
              Rule enabled
            </label>
            <Button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save rule"}
            </Button>
          </form>
        )}
      </Modal>
    </QueryState>
  );
}

export function Settings() {
  const { base, role } = useWorkspace();
  const q = useData(base + "/settings");
  const keys = useData(role === "Admin" ? base + "/keys" : "/health");
  const members = useData(role === "Admin" ? base + "/members" : "/health");
  const client = useQueryClient();
  const [raw, setRaw] = useState("");
  const [revoke, setRevoke] = useState("");
  const [member, setMember] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (
      Number(f.retention_days) < q.data.retention_days &&
      !window.confirm(
        "Reduce retention? Older spans will be permanently deleted.",
      )
    )
      return;
    setBusy(true);
    try {
      await api(base + "/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...f,
          retention_days: Number(f.retention_days),
          notifications: f.notifications === "on",
        }),
      });
      toast.success("Project settings saved");
      client.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <QueryState q={q}>
      {q.data && (
        <div className="settings-layout">
          <section>
            <SectionTitle
              title="Project settings"
              subtitle="Workspace preferences and data retention"
            />
            <form className="form-stack" onSubmit={save}>
              <label>
                Project name
                <input
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={q.data.name}
                  disabled={role !== "Admin"}
                />
              </label>
              <label>
                Retention period (days)
                <input
                  name="retention_days"
                  type="number"
                  min="1"
                  max="365"
                  required
                  defaultValue={q.data.retention_days}
                  disabled={role !== "Admin"}
                />
                <small>
                  Spans older than this window are permanently removed on save
                  and every 30 seconds.
                </small>
              </label>
              <label className="checkbox-label">
                <input
                  name="notifications"
                  type="checkbox"
                  defaultChecked={q.data.notifications}
                  disabled={role !== "Admin"}
                />
                Show workspace alert notifications
              </label>
              {role === "Admin" && (
                <Button className="primary" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              )}
            </form>
          </section>
          <section>
            <SectionTitle title="Access & security" />
            <div className="security-note">
              <ShieldCheck size={23} />
              <div>
                <strong>{role} access</strong>
                <p>
                  Every query and export is scoped to your project on the
                  server. Ingestion keys are hashed at rest.
                </p>
              </div>
            </div>
            <p className="muted">
              Sensitive inputs and outputs are redacted by default. Provider
              credentials stay in the agent’s backend environment.
            </p>
          </section>
          {role === "Admin" && (
            <>
              <section className="settings-wide">
                <SectionTitle
                  title="Ingestion keys"
                  subtitle="Keys can write telemetry only. Raw keys are shown once."
                >
                  <Button
                    onClick={async () => {
                      try {
                        const r = await api(base + "/keys", { method: "POST" });
                        setRaw(r.key);
                        client.invalidateQueries();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Plus size={14} />
                    Create key
                  </Button>
                </SectionTitle>
                {keys.data?.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Key prefix</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {keys.data.map((k: any) => (
                        <tr key={k.id}>
                          <td>
                            <KeyRound size={14} className="inline-icon" />
                            <code>{k.prefix}…</code>
                          </td>
                          <td>{date(k.created_at)}</td>
                          <td>
                            <Badge status={k.revoked ? "revoked" : "enabled"} />
                          </td>
                          <td>
                            {!k.revoked && (
                              <Button
                                className="danger-text"
                                onClick={() => setRevoke(k.id)}
                              >
                                <Trash2 size={13} />
                                Revoke
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty
                    title="No ingestion keys"
                    text="Create a key to connect the Python instrumentation SDK."
                  />
                )}
              </section>
              <section className="settings-wide">
                <SectionTitle title="Project members">
                  <Button onClick={() => setMember(true)}>
                    <Plus size={14} />
                    Add member
                  </Button>
                </SectionTitle>
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.data?.map((m: any) => (
                      <tr key={m.email}>
                        <td>{m.email}</td>
                        <td>
                          <span className="pill">{m.role}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      )}
      <Modal
        open={!!raw}
        onOpenChange={() => setRaw("")}
        title="Your ingestion key"
        description="Copy this key now. It cannot be retrieved after this dialog closes."
      >
        <pre className="json key-output">{raw}</pre>
        <Button
          className="primary"
          onClick={async () => {
            await navigator.clipboard.writeText(raw);
            toast.success("Key copied");
          }}
        >
          <Copy size={14} />
          Copy key
        </Button>
      </Modal>
      <Modal
        open={!!revoke}
        onOpenChange={() => setRevoke("")}
        title="Revoke ingestion key?"
        description="Agents using this key will immediately lose ingestion access. This cannot be undone."
      >
        <div className="dialog-actions">
          <Button onClick={() => setRevoke("")}>Cancel</Button>
          <Button
            className="danger"
            onClick={async () => {
              try {
                await api(base + "/keys/" + revoke, { method: "DELETE" });
                setRevoke("");
                client.invalidateQueries();
                toast.success("Key revoked");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Revoke key
          </Button>
        </div>
      </Modal>
      <Modal
        open={member}
        onOpenChange={setMember}
        title="Add project member"
        description="Create a local account. Share the initial password through your own secure channel."
      >
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            try {
              await api(base + "/members", {
                method: "POST",
                body: JSON.stringify(f),
              });
              setMember(false);
              client.invalidateQueries();
              toast.success("Member created");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Initial password
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            Role
            <select name="role">
              <option>Viewer</option>
              <option>Developer</option>
              <option>Admin</option>
            </select>
          </label>
          <Button className="primary">Create member</Button>
        </form>
      </Modal>
    </QueryState>
  );
}
