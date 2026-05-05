import { NextRequest, NextResponse } from 'next/server';

import { readLocalDb } from '@/lib/local-db';
import { readPdfFile } from '@/lib/local-storage';
import { fetchApplicationHtml } from '@/lib/status-checker';

const ORIGIN = 'https://oldmy.gov.uz:4433';

function buildPreviewFallback(applicationNumber: string) {
  return new NextResponse(
    `<html><body style="font-family: sans-serif; padding: 20px;">
      <h2>Unable to load the live my.gov preview</h2>
      <p>Application number: ${applicationNumber || 'unknown'}</p>
      <p>The live page is currently unavailable and there is no saved local PDF fallback for this record.</p>
    </body></html>`,
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 502,
    }
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readLocalDb();
  const application = db.applications.find((entry) => entry.id === id);

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  if (application.application_number && application.verification_password) {
    const html = await fetchApplicationHtml(
      application.application_number,
      application.verification_password
    );

    if (html) {
      const patched = html.includes('<head>')
        ? html.replace('<head>', `<head><base href="${ORIGIN}/">`)
        : `<base href="${ORIGIN}/">${html}`;

      return new NextResponse(patched, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  const preferredKey = application.pdf_storage_key ?? application.pdf_filename;
  const buffer =
    (preferredKey ? await readPdfFile(preferredKey) : null) ??
    (application.pdf_filename && application.pdf_filename !== preferredKey
      ? await readPdfFile(application.pdf_filename)
      : null);

  if (!buffer) {
    return buildPreviewFallback(application.application_number);
  }

  return NextResponse.redirect(new URL(`/api/applications/${id}/pdf`, request.url));
}
