import { put } from "@vercel/blob";
import { saveCloudRequest } from "@/lib/cloud-server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) { return saveCloudRequest(request, process.env, put); }
