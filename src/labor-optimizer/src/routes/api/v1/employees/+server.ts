import { json, type RequestHandler } from '@sveltejs/kit';
import { getCollections } from '$lib/server/database';
import { createEmployeeSchema } from '$lib/utils/validators';

export const GET: RequestHandler = async ({ url }) => {
  const db = await getCollections();
  const locationId = url.searchParams.get('locationId');
  const role = url.searchParams.get('role');
  const active = url.searchParams.get('active');

  let filter: Record<string, unknown> = {};
  if (locationId) filter.primaryLocationId = locationId;
  if (role) filter.roles = role; // simplified; real impl would use $elemMatch
  if (active !== null) filter.isActive = active !== 'false';

  const employees = await db.employees.find(filter as any);
  return json({ employees });
};

export const POST: RequestHandler = async ({ request }) => {
  const db = await getCollections();
  const body = await request.json();

  const parsed = createEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const now = new Date().toISOString();
  const employee = {
    _id: crypto.randomUUID(),
    ...parsed.data,
    secondaryLocationIds: parsed.data.secondaryLocationIds ?? [],
    certifications: parsed.data.certifications ?? [],
    availability: {},
    timeOffRequests: [],
    isActive: true,
    seniority: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.employees.insertOne(employee as any);
  return json({ employee }, { status: 201 });
};
