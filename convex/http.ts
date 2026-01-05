import { httpRouter } from 'convex/server';
import { auth } from './auth';

const http = httpRouter();

// Register Convex auth routes so the client-side auth hooks work.
auth.addHttpRoutes(http);

export default http;
