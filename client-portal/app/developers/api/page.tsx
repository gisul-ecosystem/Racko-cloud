'use client';



import Link from 'next/link';

import Image from 'next/image';

import { useEffect, useRef, useState } from 'react';

import { ChevronDown, ExternalLink, FileJson } from 'lucide-react';

import './developers-api.css';



const RACKO_RED = '#B91C1C';



const GATEWAY =

  typeof process !== 'undefined' && process.env['NEXT_PUBLIC_GATEWAY_URL']

    ? process.env['NEXT_PUBLIC_GATEWAY_URL'].replace(/\/$/, '')

    : 'http://localhost:8000';



const CURL_TOKEN = `curl -sS -X POST "${GATEWAY}/api/v1/oauth/token" \\

  -u "CLIENT_ID:CLIENT_SECRET" \\

  -H "Content-Type: application/x-www-form-urlencoded" \\

  -d "grant_type=client_credentials"`;



const CURL_LIST = `curl -sS "${GATEWAY}/api/v1/public/vms" \\

  -H "Authorization: Bearer ACCESS_TOKEN"`;



const REDOC_THEME = {

  colors: {

    primary: { main: RACKO_RED },

    success: { main: '#059669' },

    warning: { main: '#D97706' },

    error: { main: '#DC2626' },

    text: { primary: '#111827', secondary: '#4B5563' },

    border: { dark: '#E5E7EB', light: '#F3F4F6' },

    responses: { success: { color: '#059669', backgroundColor: '#ECFDF5' } },

  },

  typography: {

    fontSize: '15px',

    lineHeight: '1.6',

    fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',

    headings: {

      fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',

      fontWeight: '600',

    },

    code: {

      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',

      fontSize: '13px',

    },

  },

  sidebar: {

    width: '280px',

    backgroundColor: '#FAFAFA',

    textColor: '#374151',

  },

  rightPanel: {

    backgroundColor: '#0F172A',

    width: '42%',

  },

  schema: {

    nestedBackground: '#F9FAFB',

  },

};



export default function DevelopersApiDocsPage() {

  const redocMountRef = useRef<HTMLDivElement>(null);

  const headerRef = useRef<HTMLElement>(null);

  const redocStarted = useRef(false);

  const [quickStartOpen, setQuickStartOpen] = useState(false);



  useEffect(() => {

    if (redocStarted.current || !redocMountRef.current) return;

    redocStarted.current = true;



    const script = document.createElement('script');

    script.src = '/vendor/redoc.standalone.js';

    script.async = true;

    script.onload = () => {

      const Redoc = (window as Window & { Redoc?: { init: (...args: unknown[]) => void } }).Redoc;

      if (Redoc && redocMountRef.current) {

        Redoc.init(

          '/openapi.yaml',

          {

            scrollYOffset: () => headerRef.current?.offsetHeight ?? 56,

            hideDownloadButton: false,

            expandResponses: '200,202',

            requiredPropsFirst: true,

            sortPropsAlphabetically: false,

            nativeScrollbars: true,

            theme: REDOC_THEME,

          },

          redocMountRef.current

        );

      }

    };

    document.body.appendChild(script);



    return () => {

      script.remove();

    };

  }, []);



  return (

    <div className="min-h-screen bg-[#F8FAFC] text-gray-900 flex flex-col">

      <header

        ref={headerRef}

        id="dev-api-header"

        className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/95 backdrop-blur-md shadow-sm"

      >

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-100">

          <div className="flex items-center gap-4 min-w-0">

            <Link href="/" className="shrink-0 flex items-center gap-2">

              <Image

                src="/images/racko-logo.png"

                alt="Racko"

                width={100}

                height={28}

                className="h-7 w-auto"

                priority

              />

            </Link>

            <div className="hidden sm:block h-6 w-px bg-gray-200" aria-hidden />

            <div className="min-w-0">

              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B91C1C]">

                Developers

              </p>

              <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">

                Public VPS API

              </h1>

            </div>

          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">

            <button

              type="button"

              onClick={() => setQuickStartOpen((o) => !o)}

              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-700 hover:border-[#B91C1C]/40 hover:text-[#991B1B] transition-colors"

            >

              Quick start

              <ChevronDown

                className={`w-4 h-4 transition-transform ${quickStartOpen ? 'rotate-180' : ''}`}

              />

            </button>

            <Link

              href="/openapi.yaml"

              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-gray-600 hover:text-gray-900"

            >

              <FileJson className="w-4 h-4 shrink-0" />

              <span className="hidden sm:inline">openapi.yaml</span>

            </Link>

            <Link

              href="/openapi.json"

              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-gray-600 hover:text-gray-900"

            >

              <FileJson className="w-4 h-4 shrink-0" />

              <span className="hidden sm:inline">openapi.json</span>

            </Link>

          </div>

        </div>



        {quickStartOpen && (

          <div className="px-4 sm:px-6 py-5 bg-gradient-to-b from-white to-gray-50/80 border-b border-gray-100 max-h-[70vh] overflow-y-auto">

            <div className="max-w-5xl mx-auto space-y-5">

              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 leading-relaxed">

                <li>

                  In the Racko portal, open <strong>API Credentials</strong> and create a credential

                  with the scopes you need.

                </li>

                <li>

                  Exchange <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">client_id</code>{' '}

                  and <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">client_secret</code>{' '}

                  at <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">POST /api/v1/oauth/token</code>.

                </li>

                <li>

                  Call <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">/api/v1/public/*</code>{' '}

                  with{' '}

                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">

                    Authorization: Bearer &lt;token&gt;

                  </code>

                  .

                </li>

              </ol>



              <pre className="text-xs bg-gray-900 text-gray-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap shadow-inner">

                {CURL_TOKEN}

                {'\n\n'}

                {CURL_LIST}

              </pre>



              <div className="grid sm:grid-cols-2 gap-4 text-sm">

                <div className="rounded-xl border border-gray-200 bg-white p-4">

                  <h3 className="font-semibold text-gray-900 mb-2">Auth</h3>

                  <ul className="space-y-1 text-gray-600 list-disc list-inside text-[13px]">

                    <li>Bearer token, 1 hour (3600s)</li>

                    <li>Revoke credential → next request gets 401</li>

                    <li>HTTP Basic or form body at token endpoint</li>

                  </ul>

                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">

                  <h3 className="font-semibold text-gray-900 mb-2">Rate limits</h3>

                  <p className="text-gray-600 text-[13px] leading-relaxed">

                    Default <strong>120 req/min</strong> per credential.{' '}

                    <strong>429</strong> + <code className="text-xs">Retry-After</code> when exceeded.

                  </p>

                </div>

              </div>



              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">

                <table className="w-full text-sm">

                  <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">

                    <tr>

                      <th className="px-4 py-2.5">Scope</th>

                      <th className="px-4 py-2.5">Access</th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-gray-100 text-gray-700 text-[13px]">

                    <tr>

                      <td className="px-4 py-2 font-mono text-xs">vms:read</td>

                      <td className="px-4 py-2">List/get VMs, templates, jobs, status</td>

                    </tr>

                    <tr>

                      <td className="px-4 py-2 font-mono text-xs">vms:write</td>

                      <td className="px-4 py-2">Create, delete, power actions</td>

                    </tr>

                    <tr>

                      <td className="px-4 py-2 font-mono text-xs">vms:console</td>

                      <td className="px-4 py-2">Console / Guacamole URL</td>

                    </tr>

                    <tr>

                      <td className="px-4 py-2 font-mono text-xs">vms:assign</td>

                      <td className="px-4 py-2">Assign / onboard VMs</td>

                    </tr>

                  </tbody>

                </table>

              </div>



              <p className="text-xs text-gray-500 flex items-center gap-1 pb-1">

                Gateway base URL: <code className="bg-gray-100 px-1.5 rounded">{GATEWAY}</code>

                <ExternalLink className="w-3 h-3" />

              </p>

            </div>

          </div>

        )}

      </header>



      <main className="flex-1 w-full">

        <div

          ref={redocMountRef}

          className="developers-redoc-host bg-white border-t border-gray-200/60"

          aria-label="API reference"

        />

      </main>

    </div>

  );

}


