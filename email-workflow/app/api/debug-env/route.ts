import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    project: process.env.BRAINTRUST_PROJECT_NAME,
    slug: process.env.BRAINTRUST_DRAFT_SLUG,
    projectLength: process.env.BRAINTRUST_PROJECT_NAME?.length,
    slugLength: process.env.BRAINTRUST_DRAFT_SLUG?.length,
    projectCharCodes: Array.from(process.env.BRAINTRUST_PROJECT_NAME || '').map(c => c.charCodeAt(0)),
    slugCharCodes: Array.from(process.env.BRAINTRUST_DRAFT_SLUG || '').map(c => c.charCodeAt(0)),
  });
}
