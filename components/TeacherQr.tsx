'use client';

// The QR code a lecturer projects to send a room full of students to an experiment.
//
// Mounted once in the root layout rather than added to each teacher dashboard. There are
// seventeen of those, written at different times with three different header layouts, and
// one of them has no button group at all — so seventeen edits would have been seventeen
// chances to get it wrong, and every dashboard written afterwards would start without it.
// Reading the path instead means this is correct for /stroop/teacher, for
// /run/<slug>/teacher, and for every dashboard that does not exist yet.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { QrCode, X, Copy, Check, Download, AlertTriangle } from 'lucide-react';

/** Rendered large so the downloaded PNG is usable on a slide; CSS scales it down on screen. */
const CANVAS_PX = 1024;

/** Hosts a phone on the lecture-hall wifi cannot reach. */
const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/;

export function TeacherQr() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  // Read after mount: the server has no window, and rendering a URL that changes on
  // hydration is a mismatch React will complain about.
  useEffect(() => setOrigin(window.location.origin), []);

  // Closing on Escape, because this is opened mid-lecture with a projector running and
  // hunting for a close button in front of a room is the wrong kind of memorable.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  if (!pathname?.endsWith('/teacher')) return null;

  // The dashboard for an experiment always sits directly under it, whether that is
  // /stroop/teacher or /run/flankerLetterTask/teacher.
  const path = pathname.replace(/\/teacher$/, '') || '/';
  const url = origin ? `${origin}${path}` : '';
  const name = path.split('/').filter(Boolean).pop() ?? '';
  const isLocal = LOCAL.test(origin.replace(/^https?:\/\//, ''));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the URL is on screen to be typed either way.
    }
  };

  const download = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-qr]');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${name || 'experiment'}-qr.png`;
    a.click();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Show the QR code for students"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-purple-500 hover:bg-purple-400 text-white text-sm font-semibold shadow-lg shadow-purple-500/20 transition-colors"
      >
        <QrCode className="w-5 h-5" />
        Student QR
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-lg w-full text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-6">
              <QrCode className="w-5 h-5 text-purple-400" />
              <h2 className="font-semibold text-gray-100">Scan to take the experiment</h2>
              <button onClick={() => setOpen(false)} className="ml-auto p-1 rounded hover:bg-gray-800 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* White plate with padding: a QR needs a light background and a quiet zone
                around it, and a dark dashboard provides neither. */}
            <div className="bg-white rounded-xl p-5 inline-block">
              <QRCodeCanvas
                data-qr
                value={url || ' '}
                size={CANVAS_PX}
                level="M"
                marginSize={2}
                style={{ width: 280, height: 280 }}
              />
            </div>

            <p className="mt-5 text-sm text-gray-400 break-all font-mono">{url}</p>

            {isLocal && (
              <div className="mt-5 flex items-start gap-3 text-left p-3 rounded-xl border border-amber-400/40 bg-amber-400/10">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/90">
                  This is a local address, so a phone on the room&rsquo;s wifi cannot open it. Use the deployed
                  site when you are teaching.
                </p>
              </div>
            )}

            <div className="mt-6 flex gap-3 justify-center flex-wrap">
              <button onClick={copy}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button onClick={download}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
                <Download className="w-4 h-4" /> Download PNG
              </button>
            </div>

            <p className="mt-5 text-xs text-gray-600">
              The PNG is {CANVAS_PX}px, so it stays sharp on a lecture slide.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
