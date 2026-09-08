import { notFound } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/access/session";
import {
  analysesPerCode,
  isTopPeriod,
  loadAdminData,
  rate,
  topPeriodDays,
  TOP_PERIODS,
  type AdminEvent,
  type TopFixture,
} from "@/lib/admin/stats";
import { formatCents } from "@/lib/plans";
import { formatCode } from "@/lib/access/format";
import { eventLabel, toneClass } from "@/lib/admin/event-labels";
import { CreateCodeForm } from "@/components/admin/CreateCodeForm";
import { RevokeCodeButton } from "@/components/admin/RevokeCodeButton";
import type { AccessCodeRow } from "@/lib/supabase/types";

/**
 * Owner dashboard.
 *
 * Access: master code only. A non-owner (including someone holding a valid
 * lifetime code) gets a 404 rather than a redirect or a 403, so the page's
 * existence isn't confirmed.
 */

type PageProps = {
  searchParams: { top?: string };
};

export default async function AdminPage({ searchParams }: PageProps) {
  if (!(await isAdmin())) notFound();

  const period = isTopPeriod(searchParams.top) ? searchParams.top : "hoje";

  const [data, perCode] = await Promise.all([
    loadAdminData({ topDays: topPeriodDays(period) }),
    analysesPerCode(),
  ]);
  const { overview: o, codes, orders, events, setupError } = data;

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />

      <header
        className="fixed left-0 right-0 mx-auto max-w-[440px] z-50 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-6"
        style={{
          top: 0,
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
          paddingBottom: 16,
        }}
      >
        <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">
          Painel
        </span>
        <Link
          href="/"
          className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Voltar ao app
        </Link>
      </header>

      <main className="px-container-margin max-w-[440px] mx-auto relative z-10 pb-28 pt-[calc(env(safe-area-inset-top,0px)+84px)] anim-page-in">
        {setupError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-error/40 bg-error/10 px-4 py-3"
          >
            <p className="font-body-md text-[13px] text-on-surface">
              {setupError}
            </p>
          </div>
        )}

        <EventsPreview events={events} />
        <Money o={o} />
        <Funnel o={o} />
        <Analyses o={o} />
        <TopFixtures fixtures={o.topFixtures} period={period} />
        <DailyChart daily={o.daily} />

        <Section title="Códigos de acesso">
          <CreateCodeForm />
          <CodesTable codes={codes} perCode={perCode} />
        </Section>

        <Section title="Pagamentos">
          <OrdersTable orders={orders} />
        </Section>

        <p className="mt-8 font-body-md text-[10px] text-on-surface-variant/50 text-center">
          Atualizado em{" "}
          {new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(o.generatedAt))}
        </p>
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ blocks */

function Money({ o }: { o: Awaited<ReturnType<typeof loadAdminData>>["overview"] }) {
  return (
    <section className="mb-8">
      <div className="glass-card rounded-2xl p-5">
        <p className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">
          Receita confirmada
        </p>
        <p className="font-display-lg text-[34px] leading-none text-on-surface mt-1">
          {formatCents(o.revenue.centsTotal)}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Mini label="Últimos 7 dias" value={formatCents(o.revenue.centsWeek)} />
          <Mini label="Últimos 30 dias" value={formatCents(o.revenue.centsMonth)} />
          <Mini label="Pedidos pagos" value={String(o.revenue.ordersPaid)} />
          <Mini
            label="Pedidos abertos"
            value={String(o.revenue.ordersPending)}
            hint="cliques que não viraram pagamento"
          />
        </div>
      </div>
    </section>
  );
}

function Funnel({ o }: { o: Awaited<ReturnType<typeof loadAdminData>>["overview"] }) {
  const f = o.funnel;
  const steps = [
    { label: "Clicou em pagar", value: f.clicksTotal, week: f.clicksWeek },
    { label: "Link de pagamento gerado", value: f.createdTotal, week: f.createdWeek },
    { label: "Pagamento confirmado", value: f.paidTotal, week: f.paidWeek },
  ];

  return (
    <Section title="Funil de pagamento">
      <div className="glass-card rounded-2xl p-5">
        <div className="flex flex-col gap-4">
          {steps.map((s, i) => {
            const pct = steps[0].value
              ? (s.value / steps[0].value) * 100
              : 0;
            return (
              <div key={s.label}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="font-body-md text-[13px] text-on-surface truncate">
                    {s.label}
                  </span>
                  <span className="font-mono-data text-[14px] text-on-surface shrink-0">
                    {s.value}
                    <span className="text-on-surface-variant/60 text-[11px]">
                      {" "}
                      / 7d {s.week}
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      i === 2
                        ? "bg-emerald-400"
                        : "bg-gradient-to-r from-primary-container to-secondary-container"
                    }`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-white/10">
          <Mini
            label="Conversão clique → pago"
            value={rate(f.paidTotal, f.clicksTotal)}
          />
          <Mini
            label="Falhas ao gerar link"
            value={String(f.failedTotal)}
            hint="erro da InfinitePay ou config"
          />
          <Mini label="Pagamentos recusados" value={String(f.rejectedTotal)} />
          <Mini
            label="Paywall exibido"
            value={String(o.analyses.blockedTotal)}
            hint="jogo pago aberto sem código"
          />
        </div>
      </div>
    </Section>
  );
}

function Analyses({ o }: { o: Awaited<ReturnType<typeof loadAdminData>>["overview"] }) {
  const a = o.analyses;
  return (
    <Section title="Análises">
      <div className="grid grid-cols-2 gap-3">
        <Card label="Hoje" value={String(a.day)} />
        <Card label="7 dias" value={String(a.week)} />
        <Card label="Grátis (7d)" value={String(a.freeWeek)} tone="free" />
        <Card label="Com código (7d)" value={String(a.paidWeek)} tone="paid" />
      </div>

      <div className="glass-card rounded-xl p-4 mt-3">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-body-md text-[13px] text-on-surface">
              Calculadas de verdade
            </p>
            <p className="font-body-md text-[11px] text-on-surface-variant">
              As que custaram API + IA (o resto veio do cache)
            </p>
          </div>
          <p className="font-mono-data text-[18px] text-primary-container shrink-0">
            {a.computedWeek}
            <span className="text-on-surface-variant/60 text-[11px]"> /7d</span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10">
          <Mini label="Total geral" value={String(a.total)} />
          <Mini label="Grátis total" value={String(a.freeTotal)} />
          <Mini label="Calculadas total" value={String(a.computedTotal)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <Card label="Logins ok (7d)" value={String(o.logins.okWeek)} />
        <Card
          label="Logins falhos (7d)"
          value={String(o.logins.failedWeek)}
          tone={o.logins.failedWeek > 20 ? "warn" : undefined}
        />
      </div>

    </Section>
  );
}

/**
 * Most viewed fixtures, with team names and a period selector.
 *
 * The period is a URL param rather than client state so the whole card is
 * server-rendered — no extra JavaScript, and the choice survives a refresh.
 */
function TopFixtures({
  fixtures,
  period,
}: {
  fixtures: TopFixture[];
  period: string;
}) {
  return (
    <Section title="Jogos mais vistos">
      <div className="flex gap-1.5 mb-3">
        {TOP_PERIODS.map((p) => {
          const active = p.id === period;
          return (
            <Link
              key={p.id}
              href={`/admin?top=${p.id}`}
              scroll={false}
              className={`rounded-full border px-3 py-1.5 font-label-md text-[11px] transition-colors ${
                active
                  ? "border-primary-container bg-primary-container/15 text-primary-container"
                  : "border-white/10 bg-surface-container text-on-surface-variant hover:border-white/20"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      {fixtures.length === 0 ? (
        <p className="glass-card rounded-xl p-5 text-center font-body-md text-[13px] text-on-surface-variant">
          Nenhuma análise vista neste período.
        </p>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          {fixtures.map((f) => (
            <Link
              key={f.fixtureId}
              href={`/match/${f.fixtureId}`}
              className="block px-4 py-3 border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-headline-md text-[14px] text-on-surface truncate">
                  {f.home && f.away
                    ? `${f.home} × ${f.away}`
                    : `Jogo #${f.fixtureId}`}
                </span>
                <span className="font-mono-data text-[13px] text-on-surface shrink-0">
                  {f.views}
                  <span className="text-on-surface-variant/60 text-[10px]">
                    {" "}
                    {f.views === 1 ? "vez" : "vezes"}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 font-body-md text-[10px] text-on-surface-variant/70">
                {f.league && <span>{f.league}</span>}
                {f.freeViews > 0 && (
                  <span className="text-emerald-300/80">
                    {f.freeViews} grátis
                  </span>
                )}
                {f.views - f.freeViews > 0 && (
                  <span>{f.views - f.freeViews} com código</span>
                )}
                {!f.home && (
                  <span className="text-on-surface-variant/40">
                    fora do cache
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Pure-CSS bars: no chart library, so nothing extra ships to the browser. */
function DailyChart({
  daily,
}: {
  daily: { day: string; analyses: number; clicks: number; payments: number }[];
}) {
  if (daily.length === 0) return null;
  const max = Math.max(1, ...daily.map((d) => d.analyses));

  return (
    <Section title="Últimos 14 dias">
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-end justify-between gap-1 h-28">
          {daily.map((d) => {
            const h = Math.round((d.analyses / max) * 100);
            const label = d.day.slice(8, 10);
            return (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-center gap-1 min-w-0"
                title={`${d.day}: ${d.analyses} análises, ${d.clicks} cliques, ${d.payments} pagamentos`}
              >
                <div className="w-full flex flex-col justify-end h-20">
                  <div
                    className="w-full rounded-sm bg-gradient-to-t from-primary-container to-secondary-container"
                    style={{ height: `${Math.max(h, 3)}%` }}
                  />
                </div>
                <span className="font-mono-data text-[9px] text-on-surface-variant/60">
                  {label}
                </span>
                {d.payments > 0 && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                    title={`${d.payments} pagamento(s)`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 font-body-md text-[10px] text-on-surface-variant/70">
          Barras = análises por dia. Ponto verde = houve pagamento no dia.
        </p>
      </div>
    </Section>
  );
}

function CodesTable({
  codes,
  perCode,
}: {
  codes: AccessCodeRow[];
  perCode: Map<string, number>;
}) {
  if (codes.length === 0) {
    return (
      <p className="font-body-md text-[13px] text-on-surface-variant mt-3">
        Nenhum código ainda.
      </p>
    );
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-2 mt-3">
      {codes.map((c) => {
        const revoked = !!c.revoked_at;
        const expired =
          !revoked &&
          !c.is_permanent &&
          (!c.expires_at || new Date(c.expires_at).getTime() <= now);
        const status = revoked
          ? { label: "revogado", cls: "text-error border-error/40 bg-error/10" }
          : expired
            ? {
                label: "expirado",
                cls: "text-on-surface-variant border-white/15 bg-white/5",
              }
            : {
                label: "ativo",
                cls: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
              };

        return (
          <div key={c.code} className="glass-card rounded-xl p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono-data text-[14px] text-on-surface tracking-wider">
                {formatCode(c.code)}
              </span>
              <span
                className={`font-label-md text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${status.cls}`}
              >
                {status.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 font-body-md text-[11px] text-on-surface-variant">
              <span>{kindLabel(c.kind)}</span>
              <span className="text-on-surface-variant/50">·</span>
              <span>{c.source === "admin" ? "criado por você" : "compra"}</span>
              <span className="text-on-surface-variant/50">·</span>
              <span>
                {c.is_permanent
                  ? "não expira"
                  : c.expires_at
                    ? `até ${fmtDate(c.expires_at)}`
                    : "sem validade"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-white/5">
              <span className="font-body-md text-[11px] text-on-surface-variant">
                {perCode.get(c.code) ?? 0} análises ·{" "}
                {c.last_used_at ? `visto ${fmtDate(c.last_used_at)}` : "nunca usado"}
              </span>
              {!revoked && <RevokeCodeButton code={c.code} />}
            </div>

            {c.note && (
              <p className="mt-1.5 font-body-md text-[11px] text-primary-container/90">
                {c.note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrdersTable({
  orders,
}: {
  orders: Awaited<ReturnType<typeof loadAdminData>>["orders"];
}) {
  if (orders.length === 0) {
    return (
      <p className="font-body-md text-[13px] text-on-surface-variant">
        Nenhuma tentativa de pagamento ainda.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {orders.map((ord) => {
        const paid = ord.status === "paid";
        return (
          <div key={ord.order_nsu} className="glass-card rounded-xl p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono-data text-[13px] text-on-surface">
                {formatCents(ord.amount_cents)}
              </span>
              <span
                className={`font-label-md text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${
                  paid
                    ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
                    : "text-primary-container border-primary-container/40 bg-primary-container/10"
                }`}
              >
                {paid ? "pago" : "aberto"}
              </span>
            </div>
            <p className="mt-1.5 font-body-md text-[11px] text-on-surface-variant">
              {fmtDateTime(ord.created_at)}
              {ord.capture_method ? ` · ${ord.capture_method}` : ""}
              {ord.access_code ? ` · código ${formatCode(ord.access_code)}` : ""}
            </p>
            <p className="mt-1 font-body-md text-[9px] text-on-surface-variant/50 break-all">
              {ord.order_nsu}
            </p>
            {ord.receipt_url && (
              <a
                href={ord.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-label-md text-[10px] uppercase tracking-wider text-primary-container hover:opacity-80"
              >
                ver comprovante
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact preview of the last few events, sitting at the top of the panel
 * because it's the section checked most often. The full, self-updating stream
 * lives at /admin/eventos.
 */
function EventsPreview({ events }: { events: AdminEvent[] }) {
  const recent = events.slice(0, 6);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-headline-md text-[17px] text-on-surface">
          Eventos recentes
        </h2>
        <Link
          href="/admin/eventos"
          className="flex items-center gap-1 font-label-md text-[11px] uppercase tracking-wider text-primary-container hover:opacity-80"
        >
          Ver ao vivo
          <span className="material-symbols-outlined text-[16px]">
            arrow_forward
          </span>
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="glass-card rounded-xl p-5 text-center font-body-md text-[13px] text-on-surface-variant">
          Nada registrado ainda. Os eventos aparecem conforme o app é usado.
        </p>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          {recent.map((e) => {
            const meta = eventLabel(e.type);
            return (
              <div
                key={e.id}
                className="px-4 py-2.5 border-b border-white/5 last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`font-body-md text-[12px] ${toneClass(meta.tone)}`}
                  >
                    {meta.label}
                    {e.isFree === true && (
                      <span className="ml-1.5 font-label-md text-[9px] uppercase tracking-wider text-emerald-300">
                        grátis
                      </span>
                    )}
                  </span>
                  <span className="font-mono-data text-[10px] text-on-surface-variant/60 shrink-0">
                    {fmtDateTime(e.createdAt)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 font-body-md text-[10px] text-on-surface-variant/70">
                  {e.fixtureLabel && <span>{e.fixtureLabel}</span>}
                  {!e.fixtureLabel && e.fixtureId && (
                    <span>jogo #{e.fixtureId}</span>
                  )}
                  {e.code && <span>{formatCode(e.code)}</span>}
                  {e.amountCents != null && (
                    <span>{formatCents(e.amountCents)}</span>
                  )}
                  {e.detail && <span>{e.detail}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ atoms */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="font-headline-md text-[17px] text-on-surface mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "free" | "paid" | "warn";
}) {
  const valueCls =
    tone === "free"
      ? "text-emerald-300"
      : tone === "paid"
        ? "text-primary-container"
        : tone === "warn"
          ? "text-error"
          : "text-on-surface";
  return (
    <div className="glass-card rounded-xl p-4">
      <p className={`font-display-lg text-[24px] leading-none ${valueCls}`}>
        {value}
      </p>
      <p className="mt-1.5 font-body-md text-[11px] text-on-surface-variant">
        {label}
      </p>
    </div>
  );
}

function Mini({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="font-mono-data text-[15px] text-on-surface">{value}</p>
      <p className="font-body-md text-[10px] text-on-surface-variant leading-tight">
        {label}
      </p>
      {hint && (
        <p className="font-body-md text-[9px] text-on-surface-variant/50 leading-tight">
          {hint}
        </p>
      )}
    </div>
  );
}

function kindLabel(kind: string): string {
  if (kind === "annual") return "anual";
  if (kind === "lifetime") return "vitalício";
  return "mensal";
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Live operational data — never cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;
