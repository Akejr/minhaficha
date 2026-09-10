"use client";

import Script from "next/script";
import { useEffect } from "react";
import { captureAttribution } from "@/lib/tracking/client";

/**
 * Loads the Meta Pixel and the Google tag, and records campaign parameters.
 *
 * Mounted once from the root layout. The IDs are read on the SERVER and passed
 * down as props, so `META_PIXEL_ID` and `GOOGLE_TAG_ID` do not need the
 * `NEXT_PUBLIC_` prefix — they still end up in the HTML (any pixel id is
 * public by nature), but keeping them out of the public env namespace means
 * only this component decides what is exposed.
 *
 * Both tags are optional and independent: configure one, both, or neither.
 * With neither, `track()` degrades to a no-op and the app is unaffected.
 */
export function TrackingScripts({
  pixelId,
  googleTagId,
}: {
  pixelId?: string;
  googleTagId?: string;
}) {
  // Runs before either tag finishes loading, on purpose: the campaign
  // parameters are in the URL right now, and a visitor who bounces in two
  // seconds should still be attributed if they come back and buy.
  useEffect(() => {
    captureAttribution();
  }, []);

  return (
    <>
      {pixelId && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');
fbq('track','PageView');
            `}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${encodeURIComponent(
                pixelId,
              )}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      {googleTagId && (
        <>
          <Script
            id="google-tag-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
              googleTagId,
            )}`}
          />
          <Script id="google-tag-init" strategy="afterInteractive">
            {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = window.gtag || gtag;
gtag('js', new Date());
gtag('config', '${googleTagId}');
            `}
          </Script>
        </>
      )}
    </>
  );
}
