import { json, type RequestHandler } from '@sveltejs/kit';
import { getCollections } from '$lib/server/database';
import { updateEmployeeSchema } from '$lib/utils/validators';

export const GET: RequestHandler = async ({ params }) => {
  const db = await getCollections();
  const employee = await db.employees.findOne({ _id: params.id } as any);

  if (!employee) {
    return json({ error: 'Employee not found' }, { status: 404 });
  }

  return json({ employee });
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const db = await getCollections();
  const body = await request.json();

  const parsed = updateEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
  }

  const result = await db.employees.updateOne(
    { _id: params.id } as any,
    { $set: parsed.data as any }
  );

  if (result.modifiedCount === 0) {
    return json({ error: 'Employee not found' }, { status: 404 });
  }

  const employee = await db.employees.findOne({ _id: params.id } as any);
  return json({ employee });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const db = await getCollections();

  // Soft delete — set isActive to false
  const result = await db.employees.updateOne(
    { _id: params.id } as any,
    { $set: { isActive: false } as any }
  );

  if (result.modifiedCount === 0) {
    return json({ error: 'Employee not found' }, { status: 404 });
  }

  return json({ success: true });
};
