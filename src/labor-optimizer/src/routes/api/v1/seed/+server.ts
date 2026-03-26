import { json, type RequestHandler } from '@sveltejs/kit';
import { seedDatabase } from '$lib/server/seed';

/** POST: Seed the database with Method Co locations and compliance rules */
export const POST: RequestHandler = async () => {
	const result = await seedDatabase();
	return json({
		status: 'seed_complete',
		...result,
	});
};
