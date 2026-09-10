"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/tracking/client";

/**
 * The three funnel markers that live in the page rather than in a click
 * handler. Each one is a render-nothing component so it can be dropped
 * exactly where the condition it measures becomes true.
 */

/**
 * FreeAnalysisViewed — a visitor actually opened a free analysis.
 *
 * Mount this ONLY from a branch that already has the analysis in hand. Two
 * things follow from that, and both are requirements:
 *
 *   - it cannot fire while the data is still loading, because the server
 *     component that renders it does not exist until the data resolved;
 *   - it cannot fire on a router prefetch, because a prefetch fetches the
 *     payload without ever mounting client components or running effects.
 *
 * So "opened the analysis and the data loaded" is structural here, not a
 * condition we have to remember to check.
 */
export function FreeAnalysisTracker({ fixtureId }: { fixtureId: number }) {
  useEffect(() => {
    track({ name: "FreeAnalysisViewed", fixtureId });
  }, [fixtureId]);

  return null;
}

/**
 * SubscriptionOfferViewed — the offer was genuinely on screen.
 *
 * Rendering an offer is not the same as seeing it: the upsell card sits below
 * the stats, so most of the time it is mounted but far off screen. We wait for
 * it to intersect the viewport.
 *
 * `immediate` skips the observer for surfaces that are unmissable when they
 * exist at all — a modal, or the subscription screen itself.
 *
 * The event is deduplicated once per session across every surface (see
 * lib/tracking/client.ts), so the promo strip, this card and the modal cannot
 * each add a step to the funnel.
 */
export function SubscriptionOfferTracker({
  surface,
  immediate = false,
}: {
  surface: string;
  immediate?: boolean;
}) {
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (immediate) {
      track({ name: "SubscriptionOfferViewed", surface });
      return;
    }

    const el = sentinel.current;
    if (!el) return;

    // No IntersectionObserver (very old browser): report on mount instead of
    // dropping the event. Slightly over-counting beats a blind funnel step.
    if (typeof IntersectionObserver === "undefined") {
      track({ name: "SubscriptionOfferViewed", surface });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          track({ name: "SubscriptionOfferViewed", surface });
          // One-shot: the dedup in track() would swallow repeats anyway, but
          // disconnecting avoids doing this work on every scroll.
          observer.disconnect();
        }
      },
      // Half the card visible for a moment — enough to call it seen without
      // counting a card that merely brushed the edge during a fast scroll.
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [surface, immediate]);

  if (immediate) return null;
  // Zero-height marker: it reports position without touching layout.
  return <div ref={sentinel} aria-hidden className="h-0 w-full" />;
}

/**
 * Purchase for Google Ads — fired from the success page, and only once the
 * server has confirmed the order is paid.
 *
 * Meta's Purchase is NOT sent here. It goes through the Conversions API on the
 * server, where it is tied to a verified payment instead of to a page anyone
 * can reload.
 *
 * Deduplicated permanently per order, so refreshing, bookmarking or reopening
 * the success page tomorrow reports nothing new.
 */
export function GooglePurchaseTracker({
  orderNsu,
  valueCents,
  sendTo,
}: {
  orderNsu: string;
  valueCents: number;
  /** "AW-123456789/AbCdEfGh". Empty when Google Ads isn't configured. */
  sendTo: string;
}) {
  useEffect(() => {
    if (!sendTo) return;
    track({
      name: "Purchase",
      orderNsu,
      valueCents,
      googleSendTo: sendTo,
    });
  }, [orderNsu, valueCents, sendTo]);

  return null;
}
